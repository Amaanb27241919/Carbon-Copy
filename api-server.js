// Carbon-Copy v2 API Server
// Express REST API for orchestrator + mission management

const express = require('express');
const Orchestrator = require('./orchestrator');

const app = express();
app.use(express.json());

const orchestrator = new Orchestrator();

// Health check
app.get('/health', (req, res) => {
  const status = orchestrator.getStatus();
  res.json({
    status: 'ok',
    agents: status.agents,
    budget: status.budget,
    queuedTasks: status.queuedTasks,
  });
});

// Submit new mission
app.post('/api/missions', (req, res) => {
  const { clientId, goal, context, format } = req.body;

  if (!clientId || !goal) {
    return res.status(400).json({ error: 'clientId and goal required' });
  }

  const task = {
    id: `mission_${Date.now()}`,
    clientId,
    goal,
    context: context || '',
    format: format || 'pdf',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orchestrator.taskQueue.push(task);
  orchestrator.emit('mission:submitted', task);

  res.json({
    success: true,
    missionId: task.id,
    status: 'queued',
  });
});

// Get mission status
app.get('/api/missions/:id', (req, res) => {
  const mission = orchestrator.missionLog.find(m => m.id === req.params.id);
  
  if (!mission) {
    // Check queue
    const queued = orchestrator.taskQueue.find(t => t.id === req.params.id);
    if (queued) return res.json({ ...queued, status: 'queued' });
    return res.status(404).json({ error: 'Mission not found' });
  }

  res.json(mission);
});

// List all missions
app.get('/api/missions', (req, res) => {
  const { clientId, limit = 20 } = req.query;
  
  let missions = orchestrator.missionLog;
  if (clientId) missions = missions.filter(m => m.clientId === clientId);
  
  res.json(missions.slice(-limit).reverse());
});

// Get agent status
app.get('/api/agents', (req, res) => {
  res.json(orchestrator.getStatus().agents);
});

// Get budget status
app.get('/api/budget', (req, res) => {
  res.json(orchestrator.budgetState);
});

// Add client
app.post('/api/clients', (req, res) => {
  const { id, name, industry, monthlyBudget } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'id and name required' });
  }

  try {
    orchestrator.db.prepare(`
      INSERT INTO clients (id, name, industry, monthly_budget)
      VALUES (?, ?, ?, ?)
    `).run(id, name, industry || '', monthlyBudget || 1000);

    res.json({ success: true, clientId: id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get client info
app.get('/api/clients/:id', (req, res) => {
  try {
    const client = orchestrator.db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    
    if (!client) return res.status(404).json({ error: 'Client not found' });

    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get audit log
app.get('/api/audit', (req, res) => {
  try {
    const logs = orchestrator.db.prepare(`
      SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100
    `).all();

    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WebSocket for real-time updates
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('[WS] Client connected:', socket.id);

  // Send current status
  socket.emit('status', orchestrator.getStatus());

  // Listen for orchestrator events
  orchestrator.on('agent:status', (data) => {
    io.emit('agent:status', data);
  });

  orchestrator.on('mission:submitted', (data) => {
    io.emit('mission:submitted', data);
  });

  orchestrator.on('mission:researched', (data) => {
    io.emit('mission:researched', data);
  });

  orchestrator.on('mission:synthesized', (data) => {
    io.emit('mission:synthesized', data);
  });

  orchestrator.on('mission:delivered', (data) => {
    io.emit('mission:delivered', data);
  });

  orchestrator.on('budget:threshold', (data) => {
    io.emit('budget:alert', data);
  });

  socket.on('disconnect', () => {
    console.log('[WS] Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3002;
http.listen(PORT, () => {
  console.log(`[API] Carbon-Copy v2 listening on port ${PORT}`);
  console.log(`[API] Health: http://localhost:${PORT}/health`);
  console.log(`[API] Docs: http://localhost:${PORT}/api/missions`);
});

// Start orchestrator mission loop
orchestrator.executeMissionLoop().catch(e => {
  console.error('[Orchestrator] Fatal error:', e);
  process.exit(1);
});

module.exports = app;
