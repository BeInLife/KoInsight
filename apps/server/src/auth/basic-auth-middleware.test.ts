import express from 'express';
import request from 'supertest';
import { basicAuth } from './basic-auth-middleware';

function createApp(options: { username?: string; password?: string }) {
  const app = express();
  app.use(basicAuth(options));
  app.all(/.*/, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('basicAuth', () => {
  it('allows everything when credentials are not configured', async () => {
    const response = await request(createApp({})).get('/api/books');
    expect(response.status).toBe(200);
  });

  describe('when configured', () => {
    const app = createApp({ username: 'reader', password: 's3cret:with-colon' });

    it('rejects requests without credentials', async () => {
      const response = await request(app).get('/api/books');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic');
    });

    it('rejects wrong credentials', async () => {
      const response = await request(app).get('/api/books').auth('reader', 'nope');
      expect(response.status).toBe(401);
    });

    it('accepts correct credentials', async () => {
      const response = await request(app).get('/api/books').auth('reader', 's3cret:with-colon');
      expect(response.status).toBe(200);
    });

    it('protects the web app and the plugin API', async () => {
      expect((await request(app).get('/')).status).toBe(401);
      expect((await request(app).post('/api/plugin/import')).status).toBe(401);
    });

    it('protects the list of all progress syncs', async () => {
      const response = await request(app).get('/syncs/progress');
      expect(response.status).toBe(401);
    });

    it('leaves KoSync endpoints to their own authentication', async () => {
      expect((await request(app).post('/users/create')).status).toBe(200);
      expect((await request(app).get('/users/auth')).status).toBe(200);
      expect((await request(app).put('/syncs/progress')).status).toBe(200);
      expect((await request(app).get('/syncs/progress/abc123')).status).toBe(200);
    });
  });
});
