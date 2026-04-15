// Claude Code Agent — Sandboxed Coding Tasks
// Executes coding missions in isolated Claude Code sessions

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ClaudeCodeAgent {
  constructor(workspaceDir = './claude-code-workspace') {
    this.workspaceDir = workspaceDir;
    this.sessionMap = {};
    this.ensureWorkspace();
  }

  ensureWorkspace() {
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
    }
  }

  // Execute a coding task in Claude Code
  async executeCodingTask(taskId, prompt, context = '') {
    return new Promise((resolve, reject) => {
      const taskDir = path.join(this.workspaceDir, taskId);
      
      // Create task directory
      if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });
      }

      // Write context files if provided
      if (context) {
        fs.writeFileSync(path.join(taskDir, 'CONTEXT.md'), context);
      }

      // Spawn Claude Code process
      const proc = spawn('claude', ['code'], {
        cwd: taskDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            taskId,
            status: 'completed',
            exitCode: code,
            output: stdout,
            dir: taskDir,
          });
        } else {
          reject({
            taskId,
            status: 'failed',
            exitCode: code,
            error: stderr,
            dir: taskDir,
          });
        }
      });

      // Send prompt to Claude Code
      proc.stdin.write(prompt + '\n');
      proc.stdin.end();

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill();
        reject({
          taskId,
          status: 'timeout',
          error: 'Claude Code execution exceeded 5 minutes',
        });
      }, 5 * 60 * 1000);
    });
  }

  // Run a coding blueprint
  async runCodeBlueprint(blueprintId, missionGoal) {
    const blueprintPath = path.join(this.workspaceDir, '..', 'blueprints', `${blueprintId}.md`);
    
    if (!fs.existsSync(blueprintPath)) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    const blueprint = fs.readFileSync(blueprintPath, 'utf8');
    const taskId = `code_${Date.now()}`;

    return this.executeCodingTask(taskId, `${blueprint}\n\nMission: ${missionGoal}`);
  }

  // List available coding tasks
  listTasks() {
    const tasks = fs.readdirSync(this.workspaceDir);
    return tasks.map(taskId => ({
      taskId,
      path: path.join(this.workspaceDir, taskId),
      hasOutput: fs.existsSync(path.join(this.workspaceDir, taskId)),
    }));
  }

  // Get task output
  getTaskOutput(taskId) {
    const taskDir = path.join(this.workspaceDir, taskId);
    
    if (!fs.existsSync(taskDir)) {
      return null;
    }

    const files = fs.readdirSync(taskDir);
    const output = {};

    files.forEach(file => {
      const filePath = path.join(taskDir, file);
      try {
        output[file] = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        // Binary file, skip
      }
    });

    return { taskId, dir: taskDir, files: output };
  }

  // Clean up task directory
  cleanupTask(taskId) {
    const taskDir = path.join(this.workspaceDir, taskId);
    
    if (fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
      return { success: true, taskId };
    }

    return { success: false, taskId, error: 'Task not found' };
  }

  // Run a code review
  async reviewCode(filePath, context = '') {
    const taskId = `review_${Date.now()}`;
    const codeContent = fs.readFileSync(filePath, 'utf8');

    const prompt = `Review this code and provide feedback:

\`\`\`
${codeContent}
\`\`\`

Context: ${context}

Provide:
1. Code quality issues
2. Performance recommendations
3. Security concerns
4. Refactoring suggestions`;

    return this.executeCodingTask(taskId, prompt);
  }

  // Refactor code
  async refactorCode(filePath, instructions = '') {
    const taskId = `refactor_${Date.now()}`;
    const codeContent = fs.readFileSync(filePath, 'utf8');

    const prompt = `Refactor this code:

\`\`\`
${codeContent}
\`\`\`

Instructions: ${instructions || 'Improve readability, performance, and maintainability'}

Provide the refactored code in a code block.`;

    return this.executeCodingTask(taskId, prompt);
  }
}

module.exports = ClaudeCodeAgent;
