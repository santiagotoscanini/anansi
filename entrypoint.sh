#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit migrate

if [ $? -eq 0 ]; then
  echo "Migrations completed successfully"
else
  echo "Migration failed"
  exit 1
fi

echo "Starting application..."
exec node server.js