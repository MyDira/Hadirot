#!/bin/bash

# Weekly Performance Reports Testing Script
# This script helps you test the weekly SMS performance reports system

echo "=================================================="
echo "Weekly Performance Reports - Testing Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PROJECT_REF and SERVICE_KEY are set
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo -e "${RED}Error: SUPABASE_PROJECT_REF environment variable not set${NC}"
  echo "Usage: SUPABASE_PROJECT_REF=your-project-ref SUPABASE_SERVICE_KEY=your-service-key ./test-weekly-reports.sh"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo -e "${RED}Error: SUPABASE_SERVICE_KEY environment variable not set${NC}"
  echo "Usage: SUPABASE_PROJECT_REF=your-project-ref SUPABASE_SERVICE_KEY=your-service-key ./test-weekly-reports.sh"
  exit 1
fi

FUNCTION_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/send-weekly-performance-reports"

echo -e "${YELLOW}Testing Configuration:${NC}"
echo "  Project: ${SUPABASE_PROJECT_REF}"
echo "  Function URL: ${FUNCTION_URL}"
echo ""

# Test 1: Check if edge function is deployed
echo -e "${YELLOW}Test 1: Checking if edge function is deployed...${NC}"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${FUNCTION_URL}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json")

if [ "$STATUS_CODE" == "200" ]; then
  echo -e "${GREEN}✓ Edge function is deployed and responding${NC}"
else
  echo -e "${RED}✗ Edge function returned status code: ${STATUS_CODE}${NC}"
  echo "  Expected 200, got ${STATUS_CODE}"
fi
echo ""

# Test 2: Execute function and get response
echo -e "${YELLOW}Test 2: Executing weekly reports function...${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTION_URL}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json")

echo "Response:"
echo "${RESPONSE}" | jq '.' 2>/dev/null || echo "${RESPONSE}"
echo ""

# Test 3: Check if response indicates success
if echo "${RESPONSE}" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Function executed successfully${NC}"

  # Extract summary if available
  TOTAL_CONTACTS=$(echo "${RESPONSE}" | jq -r '.summary.totalContacts' 2>/dev/null)
  SMS_SENT=$(echo "${RESPONSE}" | jq -r '.summary.smsSent' 2>/dev/null)
  SMS_ERRORS=$(echo "${RESPONSE}" | jq -r '.summary.smsErrors' 2>/dev/null)

  if [ "$TOTAL_CONTACTS" != "null" ]; then
    echo ""
    echo "Summary:"
    echo "  Total Contacts: ${TOTAL_CONTACTS}"
    echo "  SMS Sent: ${SMS_SENT}"
    echo "  SMS Errors: ${SMS_ERRORS}"
  fi
else
  echo -e "${RED}✗ Function execution failed or returned unexpected response${NC}"
fi
echo ""

# Test 4: Verify cron job is scheduled
echo -e "${YELLOW}Test 4: Checking cron job schedule...${NC}"
echo "To verify the cron job, run this SQL query in your Supabase dashboard:"
echo ""
echo "  SELECT jobname, schedule, active"
echo "  FROM cron.job"
echo "  WHERE jobname = 'send-weekly-performance-reports';"
echo ""
echo "Expected result:"
echo "  jobname: send-weekly-performance-reports"
echo "  schedule: 0 19 * * 4"
echo "  active: true"
echo ""

echo "=================================================="
echo "Testing Complete!"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "1. Check Twilio console for SMS delivery status"
echo "2. Verify recipients received SMS messages"
echo "3. Review edge function logs in Supabase dashboard"
echo "4. Wait for next Thursday at 2 PM EST for automatic execution"
echo ""
echo "For more information, see WEEKLY_PERFORMANCE_REPORTS.md"
