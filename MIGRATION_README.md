# Redis to PostgreSQL Migration Guide

This guide will help you migrate your Signalist backend from Redis to PostgreSQL using Prisma.

## Prerequisites

1. **PostgreSQL Database**: Ensure you have a PostgreSQL database running and accessible
2. **Environment Variables**: Add the following to your `.env` file:
   ```
   POSTGRES_URL=postgresql://username:password@host:port/database_name
   POSTGRES_HOST=your_postgres_host
   POSTGRES_PORT=5432
   POSTGRES_PASSWORD=your_postgres_password
   ```

## Migration Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

### Step 3: Create Database Tables

```bash
npx prisma db push
```

### Step 4: Migrate Data from Redis to PostgreSQL

```bash
npm run migrate:redis-to-postgres
```

This script will:

- Extract all users, posts, signals, and messages from Redis
- Transform the data to match the new PostgreSQL schema
- Insert the data into PostgreSQL using Prisma
- Handle relationships (follows, blocks, etc.)

### Step 5: Remove Redis Dependencies

```bash
npm run remove:redis
```

This script will:

- Update all import statements to use the new database service
- Remove Redis service files
- Update package.json to remove Redis dependencies

### Step 6: Install Updated Dependencies

```bash
npm install
```

### Step 7: Test Your Application

```bash
npm run dev
```

## What Changed

### Database Schema

The new Prisma schema includes:

- **User Model**: Users with profile information, followers, followings, and blocks
- **Post Model**: Posts with content, media, and engagement metrics
- **Signal Model**: Trading signals with pricing and status information
- **Message Models**: Message rooms, participants, and individual messages
- **Relationship Models**: Follow and block relationships between users

### Service Layer

- **Redis Service**: Replaced with `DatabaseService`
- **Backward Compatibility**: The new service maintains the same API interface
- **Performance**: PostgreSQL provides better query performance and ACID compliance

### Data Structure

- **Normalized Data**: Data is now properly normalized with foreign key relationships
- **Type Safety**: Prisma provides type safety and validation
- **Migrations**: Easy database schema evolution with Prisma migrations

## Data Migration Details

### Users

- Profile information (username, email, bio, images)
- Follower/following relationships
- Block relationships
- User statistics (post count, signal count, score)

### Posts

- Content and media
- User associations
- Engagement metrics (likes, dislikes, comments, shares)

### Signals

- Trading information (symbol, type, prices)
- User associations
- Status and scoring

### Messages

- Message rooms and participants
- Individual messages with user associations
- Media attachments

## Troubleshooting

### Common Issues

1. **Database Connection Error**

   - Verify your PostgreSQL connection string
   - Ensure the database exists and is accessible
   - Check firewall and network settings

2. **Migration Errors**

   - Review the migration logs for specific error messages
   - Ensure Redis is accessible during migration
   - Check data format compatibility

3. **Import Errors**
   - Verify all files are updated with the new service
   - Check for any remaining Redis service references
   - Ensure Prisma client is generated

### Rollback Plan

If you need to rollback:

1. Keep your Redis data until migration is verified
2. Restore Redis service files from version control
3. Revert import statements
4. Restore package.json dependencies

## Performance Considerations

### PostgreSQL Optimizations

- **Indexes**: Prisma automatically creates indexes for primary and foreign keys
- **Query Optimization**: Use Prisma's query optimization features
- **Connection Pooling**: Configure connection pooling for production

### Migration Performance

- **Batch Processing**: The migration script processes data in batches
- **Error Handling**: Individual record failures don't stop the entire migration
- **Progress Logging**: Monitor migration progress through console output

## Post-Migration Tasks

1. **Verify Data Integrity**

   - Check that all data was migrated correctly
   - Verify relationships are properly established
   - Test application functionality

2. **Update Configuration**

   - Remove Redis environment variables
   - Update deployment configurations
   - Update monitoring and logging

3. **Performance Testing**
   - Test application performance with PostgreSQL
   - Monitor database query performance
   - Optimize slow queries if needed

## Support

If you encounter issues during migration:

1. Check the migration logs for error details
2. Verify your PostgreSQL setup
3. Ensure all environment variables are correct
4. Test database connectivity independently

## Benefits of PostgreSQL

- **ACID Compliance**: Better data integrity and consistency
- **Complex Queries**: Support for complex relationships and aggregations
- **Scalability**: Better performance with large datasets
- **Ecosystem**: Rich ecosystem of tools and extensions
- **Standards**: SQL compliance and industry standards
