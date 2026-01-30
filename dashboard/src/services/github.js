/* ═══════════════════════════════════════════════════════════
   GITHUB SERVICE - Main process (Node.js)
   Octokit client for GitHub Actions API
   ═══════════════════════════════════════════════════════════ */

let Octokit = null;
let octokit = null;
let owner = '';
let repo = '';
let initialized = false;

/**
 * Initialize GitHub API client (uses dynamic import for ESM Octokit)
 */
async function init({ token, githubOwner, githubRepo }) {
  if (!token) {
    console.warn('[GitHub] No token provided - API calls will be unauthenticated');
    return false;
  }

  owner = githubOwner;
  repo = githubRepo;

  try {
    const mod = await import('@octokit/rest');
    Octokit = mod.Octokit;
    octokit = new Octokit({ auth: token });
    initialized = true;
    console.log(`[GitHub] Connected to ${owner}/${repo}`);
    return true;
  } catch (err) {
    console.error('[GitHub] Failed to load Octokit:', err.message);
    return false;
  }
}

function isConnected() {
  return initialized && octokit !== null;
}

// ════════════════════════════════════════════
//  WORKFLOW RUNS
// ════════════════════════════════════════════

/**
 * Get recent workflow runs for the autopilot workflow
 */
async function getWorkflowRuns({ limit = 20 } = {}) {
  if (!octokit) return [];

  try {
    const { data } = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: 'autopilot.yml',
      per_page: limit,
    });

    const runs = data.workflow_runs.map(run => ({
      id: run.id,
      name: run.name,
      displayTitle: run.display_title,
      status: run.status,           // queued, in_progress, completed
      conclusion: run.conclusion,   // success, failure, cancelled, null
      branch: run.head_branch,
      event: run.event,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      url: run.html_url,
      agentName: extractAgentName(run),
    }));

    // For runs with unknown agent, try to get it from jobs
    for (const run of runs) {
      if (run.agentName === 'unknown') {
        try {
          const jobs = await getRunJobs(run.id);
          for (const job of jobs) {
            if (job.name && job.name !== 'determine-agent' && job.name !== 'notify') {
              // Job name often contains the agent like "run-agent (daily-health)"
              const match = job.name.match(/\(([^)]+)\)/);
              if (match) {
                run.agentName = match[1];
                break;
              }
            }
          }
        } catch (e) {
          // Ignore - keep unknown
        }
      }
    }

    return runs;
  } catch (err) {
    console.error('[GitHub] getWorkflowRuns error:', err.message);
    return [];
  }
}

/**
 * Extract agent name from workflow run
 */
function extractAgentName(run) {
  const agentNames = ['daily-health', 'test-fixer', 'deps-updater', 'security-scanner', 'codebase-mapper', 'docs-generator', 'full-audit'];

  // Check display_title for agent name patterns
  if (run.display_title) {
    // Try "agent: <name>" pattern
    const agentMatch = run.display_title.match(/agent:\s*(\S+)/i);
    if (agentMatch) return agentMatch[1];

    // Try direct agent name match anywhere in title
    const titleLower = run.display_title.toLowerCase();
    for (const name of agentNames) {
      if (titleLower.includes(name)) return name;
    }
  }

  // Check run name
  if (run.name) {
    const nameLower = run.name.toLowerCase();
    for (const name of agentNames) {
      if (nameLower.includes(name)) return name;
    }
  }

  // Check head_commit message if available
  if (run.head_commit && run.head_commit.message) {
    const msgLower = run.head_commit.message.toLowerCase();
    for (const name of agentNames) {
      if (msgLower.includes(name)) return name;
    }
  }

  return 'unknown';
}

/**
 * Get jobs for a workflow run (to extract agent input)
 */
async function getRunJobs(runId) {
  if (!octokit) return [];

  try {
    const { data } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });

    return data.jobs.map(job => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    }));
  } catch (err) {
    console.error('[GitHub] getRunJobs error:', err.message);
    return [];
  }
}

/**
 * Trigger the autopilot workflow for a specific agent
 */
async function triggerWorkflow(agentName) {
  if (!octokit) {
    return { success: false, error: 'GitHub not connected' };
  }

  try {
    await octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: 'autopilot.yml',
      ref: 'fresh-start',
      inputs: {
        agent: agentName,
      },
    });

    console.log(`[GitHub] Workflow triggered for agent: ${agentName}`);
    return { success: true };
  } catch (err) {
    console.error('[GitHub] triggerWorkflow error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get status of a specific workflow run
 */
async function getRunStatus(runId) {
  if (!octokit) return null;

  try {
    const { data } = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });

    return {
      id: data.id,
      status: data.status,
      conclusion: data.conclusion,
      url: data.html_url,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error('[GitHub] getRunStatus error:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════
//  PULL REQUESTS
// ════════════════════════════════════════════

/**
 * Get open PRs created by autopilot
 */
async function getAutopilotPRs() {
  if (!octokit) return [];

  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 20,
    });

    // Filter to autopilot-created PRs
    return data
      .filter(pr => pr.head.ref.startsWith('autopilot/'))
      .map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        branch: pr.head.ref,
        state: pr.state,
        createdAt: pr.created_at,
        url: pr.html_url,
        mergeable: pr.mergeable,
        labels: pr.labels.map(l => l.name),
      }));
  } catch (err) {
    console.error('[GitHub] getAutopilotPRs error:', err.message);
    return [];
  }
}

/**
 * Merge an autopilot PR
 */
async function mergePR(pullNumber) {
  if (!octokit) {
    return { success: false, error: 'GitHub not connected' };
  }

  try {
    await octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: 'squash',
    });

    console.log(`[GitHub] PR #${pullNumber} merged`);
    return { success: true };
  } catch (err) {
    console.error('[GitHub] mergePR error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Close an autopilot PR without merging
 */
async function closePR(pullNumber) {
  if (!octokit) {
    return { success: false, error: 'GitHub not connected' };
  }

  try {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: 'closed',
    });

    console.log(`[GitHub] PR #${pullNumber} closed`);
    return { success: true };
  } catch (err) {
    console.error('[GitHub] closePR error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  init,
  isConnected,
  // Workflows
  getWorkflowRuns,
  triggerWorkflow,
  getRunStatus,
  // PRs
  getAutopilotPRs,
  mergePR,
  closePR,
};
