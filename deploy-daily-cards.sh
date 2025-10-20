#!/bin/bash

# Deploy the daily-listing-cards Edge Function to Supabase
# This script assumes you have Supabase CLI installed and logged in

echo "🚀 Deploying daily-listing-cards Edge Function..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Deploy the function
supabase functions deploy daily-listing-cards

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "Next steps:"
    echo "1. Go to Admin Panel → Daily Cards tab"
    echo "2. Add your email address"
    echo "3. Click 'Send Test Email'"
else
    echo "❌ Deployment failed. Please check the error above."
    exit 1
fi
