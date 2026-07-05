#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi
echo "Starting local server: http://localhost:8080"
echo "Admin: http://localhost:8080/admin.html  password: 69677323"
npm start
