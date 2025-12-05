#!/bin/bash
# Hostinger Deployment Script

echo "🚀 Building for production..."
npm run build

echo "📦 Creating deployment package..."
cd out
tar -czf ../deploy.tar.gz .
cd ..

echo "✅ Deployment package created: deploy.tar.gz"
echo ""
echo "📤 Upload deploy.tar.gz to your Hostinger public_html folder"
echo "Then extract it using File Manager or run:"
echo "tar -xzf deploy.tar.gz && rm deploy.tar.gz"
