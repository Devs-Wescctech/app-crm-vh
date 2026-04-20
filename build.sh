#!/bin/bash
set -e
npm install --legacy-peer-deps
npm run build
cd backend
npm install --legacy-peer-deps
