const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
process.env.CLOUDINARY_API_KEY = 'cloud-key';
process.env.CLOUDINARY_API_SECRET = 'cloud-secret';
process.env.CLOUDINARY_UPLOAD_FOLDER = 'diary';
process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const READ_DIARY_ID = '10000000-0000-4000-8000-000000000001';
const UNREAD_DIARY_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_COUPLE_DIARY_ID = '10000000-0000-4000-8000-000000000003';
const FIRST_READ_AT = '2026-06-11T12:00:00Z';

class FakeQuery {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.filters = [];
    this.inFilters = [];
    this.operation = 'select';
    this.values = null;
  }

  select() {
    this.operation = this.operation === 'upsert' ? 'upsert' : 'select';
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  in(column, values) {
    this.inFilters.push({ column, values });
    return this;
  }

  order() {
    return this;
  }

  upsert(values) {
    this.operation = 'upsert';
    this.values = values;
    return this;
  }

  maybeSingle() {
    return this.execute(true);
  }

  single() {
    return this.execute(true);
  }

  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }

  async execute(single) {
    if (this.table === 'diaries') {
      return this.executeDiaries(single);
    }

    if (this.table === 'diary_reads') {
      return this.executeDiaryReads(single);
    }

    return { data: single ? null : [], error: null };
  }

  executeDiaries(single) {
    let rows = [...this.state.accessibleDiaryIds]
      .map((id) => this.state.diaries.get(id))
      .filter(Boolean);

    rows = this.applyFilters(rows);
    return { data: single ? rows[0] ?? null : rows, error: null };
  }

  executeDiaryReads(single) {
    if (this.operation === 'upsert') {
      const { user_id, diary_id } = this.values;

      if (user_id !== this.state.userId || !this.state.accessibleDiaryIds.has(diary_id)) {
        return { data: null, error: { message: 'RLS denied' } };
      }

      const key = `${user_id}:${diary_id}`;
      if (!this.state.reads.has(key)) {
        this.state.reads.set(key, {
          user_id,
          diary_id,
          read_at: this.state.nextReadAt(),
        });
        this.state.insertCounts.set(key, (this.state.insertCounts.get(key) ?? 0) + 1);
      }

      return { data: null, error: null };
    }

    let rows = [...this.state.reads.values()]
      .filter((row) => row.user_id === this.state.userId)
      .filter((row) => this.state.accessibleDiaryIds.has(row.diary_id));

    rows = this.applyFilters(rows);
    return { data: single ? rows[0] ?? null : rows, error: null };
  }

  applyFilters(rows) {
    let result = rows;

    for (const { column, value } of this.filters) {
      result = result.filter((row) => row[column] === value);
    }

    for (const { column, values } of this.inFilters) {
      const allowed = new Set(values);
      result = result.filter((row) => allowed.has(row[column]));
    }

    return result;
  }
}

function createState({ accessibleIds, readIds = [] }) {
  const diaries = new Map(
    [READ_DIARY_ID, UNREAD_DIARY_ID, OTHER_COUPLE_DIARY_ID].map((id) => [
      id,
      {
        id,
        title: `Diary ${id}`,
        diary_images: [],
        comments: [],
        diary_reactions: [],
      },
    ]),
  );

  const reads = new Map();
  for (const diaryId of readIds) {
    reads.set(`${USER_ID}:${diaryId}`, {
      user_id: USER_ID,
      diary_id: diaryId,
      read_at: FIRST_READ_AT,
    });
  }

  return {
    userId: USER_ID,
    accessibleDiaryIds: new Set(accessibleIds),
    diaries,
    reads,
    insertCounts: new Map(),
    nextReadAt: () => FIRST_READ_AT,
  };
}

function createFakeClient(state) {
  return {
    from: (table) => new FakeQuery(state, table),
  };
}

function loadDiariesRouter(state) {
  const supabasePath = require.resolve('../dist/lib/supabase.js');
  const authPath = require.resolve('../dist/middleware/auth.js');
  const diariesPath = require.resolve('../dist/routes/diaries.js');

  const supabaseModule = require(supabasePath);
  supabaseModule.createUserClient = () => createFakeClient(state);
  supabaseModule.supabaseAdmin = createFakeClient(state);

  const authModule = require(authPath);
  authModule.authenticate = (req, _res, next) => {
    req.userId = state.userId;
    req.accessToken = 'test-token';
    next();
  };

  delete require.cache[diariesPath];
  return require(diariesPath).default;
}

async function withApp(state, fn) {
  const app = express();
  app.use(express.json());
  app.use('/diaries', loadDiariesRouter(state));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function request(baseUrl, method, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test('PUT /diaries/:id/read marks an accessible diary and is idempotent', async () => {
  const state = createState({ accessibleIds: [READ_DIARY_ID] });

  await withApp(state, async (baseUrl) => {
    const first = await request(baseUrl, 'PUT', `/diaries/${READ_DIARY_ID}/read`);
    const second = await request(baseUrl, 'PUT', `/diaries/${READ_DIARY_ID}/read`);

    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data, {
      diary_id: READ_DIARY_ID,
      read_at: FIRST_READ_AT,
    });

    assert.equal(second.status, 200);
    assert.deepEqual(second.body.data, first.body.data);
    assert.equal(state.reads.size, 1);
    assert.equal(state.insertCounts.get(`${USER_ID}:${READ_DIARY_ID}`), 1);
  });
});

test('PUT /diaries/:id/read does not create reads for inaccessible diaries', async () => {
  const state = createState({ accessibleIds: [READ_DIARY_ID] });

  await withApp(state, async (baseUrl) => {
    const response = await request(baseUrl, 'PUT', `/diaries/${OTHER_COUPLE_DIARY_ID}/read`);

    assert.equal(response.status, 404);
    assert.equal(state.reads.size, 0);
  });
});

test('GET /diaries/read-status returns only accessible requested diary statuses', async () => {
  const state = createState({
    accessibleIds: [READ_DIARY_ID, UNREAD_DIARY_ID],
    readIds: [READ_DIARY_ID],
  });

  await withApp(state, async (baseUrl) => {
    const ids = [READ_DIARY_ID, UNREAD_DIARY_ID, OTHER_COUPLE_DIARY_ID].join(',');
    const response = await request(baseUrl, 'GET', `/diaries/read-status?ids=${ids}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      [READ_DIARY_ID]: FIRST_READ_AT,
      [UNREAD_DIARY_ID]: null,
    });
  });
});

test('GET /diaries/:id includes my_read_at for the current user', async () => {
  const state = createState({
    accessibleIds: [READ_DIARY_ID],
    readIds: [READ_DIARY_ID],
  });

  await withApp(state, async (baseUrl) => {
    const response = await request(baseUrl, 'GET', `/diaries/${READ_DIARY_ID}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, READ_DIARY_ID);
    assert.equal(response.body.data.my_read_at, FIRST_READ_AT);
  });
});
