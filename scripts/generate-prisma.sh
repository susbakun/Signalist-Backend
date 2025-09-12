#!/bin/bash

# Prisma Client Generation Script for Production
# This script handles Prisma client generation in read-only environments

echo "🔧 Setting up Prisma Client for production..."

# Create the generated directory if it doesn't exist
mkdir -p generated

# Set environment variables for Prisma
export PRISMA_GENERATE_SKIP_AUTOINSTALL=true

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Check if generation was successful
if [ $? -eq 0 ]; then
    echo "✅ Prisma client generated successfully!"
    echo "📁 Client location: ./generated/client"
    
    # List the generated files
    echo "📋 Generated files:"
    ls -la generated/client/ 2>/dev/null || echo "No files found in generated/client"
    
else
    echo "❌ Prisma client generation failed!"
    exit 1
fi

echo "🎉 Prisma setup completed!"
