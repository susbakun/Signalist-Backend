# Migration Scripts

This directory contains scripts to migrate data when schema changes occur.

## Signal Score Migration

### Overview

The `migrate-signals-score.js` script adds a `score` field to all existing signals in your Redis database. This field tracks how many targets have been successfully hit for each signal.

### Usage

#### Option 1: Using npm script (Recommended)

```bash
npm run migrate:signals-score
```

#### Option 2: Direct execution

```bash
node src/scripts/migrate-signals-score.js
```

### Prerequisites

1. **Redis Server**: Make sure your Redis server is running and accessible
2. **Environment Variables**: Ensure your Redis connection is properly configured in your environment
   - Set `REDIS_URL` to your Redis connection string
   - Or set `USE_IN_MEMORY_REDIS=false` to use actual Redis

### What the script does

1. **Finds all signals**: Searches for all keys matching `signal:*` pattern
2. **Checks existing scores**: Skips signals that already have a score field
3. **Calculates scores**: For signals without scores, counts the number of touched targets
4. **Updates database**: Saves the updated signal data back to Redis

### Expected output

```
Starting signal score migration...
Found 15 signals to migrate
✅ Migrated signal abc123: added score = 2
✅ Migrated signal def456: added score = 0
Signal xyz789 already has score field (3), skipping

=== Migration Complete ===
Total signals found: 15
✅ Successfully migrated: 12
⏭️  Skipped (already had score): 3
❌ Failed: 0

🎉 Migration successful! All existing signals now have score fields.
```

### Troubleshooting

#### "No signals found" error

This could mean:

- Redis server is not running
- Connection configuration is incorrect
- No signals exist in your database
- You're in in-memory mode (check console output)

#### "Using in-memory Redis mode" warning

This means the script couldn't connect to your Redis server and is using fallback in-memory storage. Your actual signals won't be migrated in this mode.

To fix:

1. Start your Redis server
2. Check your `REDIS_URL` environment variable
3. Run the script again

### Safety Features

- **Non-destructive**: Only adds the score field, doesn't modify existing data
- **Idempotent**: Can be run multiple times safely
- **Error handling**: Continues processing other signals if one fails
- **Detailed logging**: Shows exactly what was migrated

### When to run this script

Run this migration script:

- **Once** after upgrading to the version that includes signal scores
- After restoring from a backup that doesn't include signal scores
- If you notice signals are missing score fields
