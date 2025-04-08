# Signalist Backend

A Node.js Express backend service for the Signalist frontend application, using Redis for data storage.

## Features

- Express.js REST API
- Redis database integration
- CORS support
- Environment configuration
- API request logging
- Error handling

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Redis server (or use the provided Redis URL)

## Installation

1. Clone the repository

```bash
git clone <repository-url>
cd Signalist-Backend
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables (or use the existing one):

```
NODE_ENV=development
PORT=5000
REDIS_URL=redis://:93kzj0FZhKPXLugDlBP9yo31@signalist:6379/0
```

## Running the Application

### Development mode

```bash
npm run dev
```

This will start the server with nodemon, which automatically restarts when you make changes.

### Production mode

```bash
npm start
```

## API Endpoints

### Health Check

- `GET /api/health` - Check if the API is running

### Data Operations

- `GET /api/data/:key` - Get data for a specific key
- `POST /api/data/:key` - Store data with a specific key
- `PUT /api/data/:key` - Update data for a specific key
- `DELETE /api/data/:key` - Delete data for a specific key

## Project Structure

```
├── .env                  # Environment variables
├── package.json          # Project dependencies and scripts
├── src/
│   ├── index.js          # Application entry point
│   ├── routes/           # API routes
│   │   ├── index.js      # Routes entry point
│   │   └── data.routes.js # Data-related routes
│   └── services/         # Business logic
│       └── redis.service.js # Redis service
```

## Error Handling

The API returns appropriate HTTP status codes and error messages in JSON format:

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information (only in development)"
}
```

## License

ISC
