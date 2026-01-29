# SmartCookBook Autopilot

Autonomous AI-powered maintenance system for SmartCookBook.

## Overview

The Autopilot system uses Claude AI to automatically maintain your codebase:
- Fix failing tests
- Update dependencies safely
- Scan for security vulnerabilities
- Generate documentation
- Perform regular health checks

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Actions                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Daily   │ │ Weekly  │ │ Weekly  │ │ Monthly │       │
│  │ 6 AM    │ │ Sunday  │ │ Friday  │ │ 1st     │       │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
└───────┼──────────┼──────────┼──────────┼───────────────┘
        │          │          │          │
        ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                          │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ daily-health│  │ deps-updater│  │ full-audit  │     │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤     │
│  │ test-fixer  │  │ security    │  │ docs-gen    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Claude API (Analysis & Fixes)        │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Git → Create Branch → PR               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Agents

| Agent | Schedule | Purpose |
|-------|----------|---------|
| `daily-health` | Daily 6 AM | Run tests, check build, lint, security |
| `test-fixer` | On CI failure | Analyze and fix failing tests |
| `deps-updater` | Sunday 3 AM | Update dependencies safely |
| `security-scanner` | Monday 4 AM | Scan for vulnerabilities |
| `docs-generator` | Friday 5 AM | Add JSDoc, update README |
| `full-audit` | 1st of month | Comprehensive codebase analysis |

## Setup

### 1. Install Dependencies

```bash
cd scripts/autopilot
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
ANTHROPIC_API_KEY=your-api-key
NOTIFY_EMAIL=your-email@example.com
```

### 3. GitHub Secrets

Add these secrets to your repository:
- `ANTHROPIC_API_KEY` - Your Claude API key
- `NOTIFY_EMAIL` - Email for notifications (optional)
- `SLACK_WEBHOOK` - Slack webhook URL (optional)

## Usage

### Manual Run

```bash
# Run specific agent
node orchestrator.js daily-health
node orchestrator.js test-fixer
node orchestrator.js deps-updater
node orchestrator.js security-scanner
node orchestrator.js docs-generator
node orchestrator.js full-audit
```

### GitHub Actions

The workflow runs automatically on schedule. You can also trigger manually:
1. Go to Actions → SmartCookBook Autopilot
2. Click "Run workflow"
3. Select the agent to run

## How It Works

### Test Fixer
1. Runs tests and captures failures
2. Reads test file and source file
3. Asks Claude to analyze the failure
4. Applies high-confidence fixes
5. Verifies tests pass
6. Creates PR if successful

### Dependency Updater
1. Lists outdated packages
2. Separates major (risky) from minor (safe) updates
3. Updates safe packages one at a time
4. Runs tests after each update
5. Rolls back if tests fail
6. Creates PR with successful updates

### Security Scanner
1. Runs `npm audit`
2. Attempts `npm audit fix`
3. Scans for exposed secrets
4. Checks for security anti-patterns
5. Reports findings

### Docs Generator
1. Finds exported functions without JSDoc
2. Uses Claude to generate documentation
3. Inserts JSDoc comments
4. Verifies tests still pass

## Configuration

Edit `orchestrator.js` to customize:
- `CONFIG.projectRoot` - Path to your app
- `CONFIG.mainBranch` - Main branch name
- `CONFIG.maxChangesPerRun` - Limit changes per run
- `CONFIG.testCommand` - Test command

## Safety Features

1. **Branch isolation** - All changes happen on feature branches
2. **Test verification** - Tests must pass before PR creation
3. **Rollback** - Failed changes are automatically reverted
4. **High-confidence only** - Low-confidence fixes are skipped
5. **Limited scope** - Max 5-10 changes per run

## Extending

Add a new agent:

1. Create `agents/my-agent.js`:
```javascript
export async function run({ runTests, runCommand, projectRoot }) {
  const report = { changes: [] };
  // Your logic here
  return report;
}
```

2. Register in `orchestrator.js`:
```javascript
const AGENTS = {
  'my-agent': {
    name: 'My Agent',
    schedule: '0 7 * * *',
    description: 'Does something useful',
    autoFix: true,
  },
  // ...
};
```

3. Add to GitHub Actions schedule if needed.

## Monitoring

- Check GitHub Actions for run history
- Download report artifacts for details
- Set up Slack/email notifications for failures

## Cost Considerations

- Claude API calls: ~$0.01-0.10 per agent run
- GitHub Actions: Free for public repos, 2000 mins/month for private
- Estimated monthly cost: $5-20 depending on usage

---

*Part of the SmartCookBook ecosystem*
