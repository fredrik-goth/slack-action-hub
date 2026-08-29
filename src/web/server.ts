import express, { Request, Response } from 'express';
import path from 'path';
import { taskAggregator } from '../services/taskAggregator';
import { TaskFilter } from '../types/task';
import { config } from '../config';

export function createWebServer(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  // GET /api/tasks - Retrieve filtered tasks
  app.get('/api/tasks', async (req: Request, res: Response) => {
    try {
      const filter: TaskFilter = {
        source: req.query.source as any,
        status: req.query.status as any,
        priority: req.query.priority as any,
        searchQuery: req.query.q as string,
      };

      const force = req.query.refresh === 'true';
      const tasks = await taskAggregator.getTasks(filter, force);
      const stats = taskAggregator.getStats();

      res.json({
        success: true,
        tasks,
        stats,
        providers: taskAggregator.getProviderStatus(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/stats - Retrieve current stats
  app.get('/api/stats', (req: Request, res: Response) => {
    res.json({
      success: true,
      stats: taskAggregator.getStats(),
      providers: taskAggregator.getProviderStatus(),
    });
  });

  // POST /api/tasks/:id/complete - Complete a task
  app.post('/api/tasks/:id/complete', async (req: Request, res: Response) => {
    try {
      const taskId = String(req.params.id);
      const success = await taskAggregator.completeTask(taskId);
      res.json({ success, taskId });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/tasks/:id/snooze - Snooze a task
  app.post('/api/tasks/:id/snooze', async (req: Request, res: Response) => {
    try {
      const taskId = String(req.params.id);
      const hours = parseInt(req.body.hours || '24', 10);
      const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

      const success = await taskAggregator.snoozeTask(taskId, snoozeUntil);
      res.json({ success, taskId, snoozedUntil: snoozeUntil });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/refresh - Force sync from all providers
  app.post('/api/refresh', async (req: Request, res: Response) => {
    try {
      const tasks = await taskAggregator.refreshTasks();
      const stats = taskAggregator.getStats(tasks);
      res.json({ success: true, count: tasks.length, stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // OAuth2 Callback handler helper for Google Cloud authentication
  app.get('/oauth2callback', (req: Request, res: Response) => {
    const code = req.query.code;
    if (code) {
      res.send(`
        <html>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
            <h2>🎉 Google Authorization Code Received!</h2>
            <p>Copy this authorization code and exchange it for your refresh token, or follow the README guide:</p>
            <code style="background: #1e293b; padding: 10px 18px; border-radius: 8px; font-size: 15px; color: #38bdf8; display: inline-block; margin: 15px 0;">${code}</code>
            <p><a href="/" style="color: #60a5fa; text-decoration: none;">➔ Back to Action Hub Dashboard</a></p>
          </body>
        </html>
      `);
    } else {
      res.status(400).send('No authorization code provided in callback.');
    }
  });

  return app;
}
