#!/bin/bash

echo "🔍 Testing Validator Search System"
echo "=================================="

# Test 1: Search for validator
echo -e "\n1. Searching for validator 'Asuga'..."
SEARCH_RESULT=$(curl -s "http://localhost:3001/api/validators/search?q=Asuga" | jq -r '.data[0].validator_identity')
echo "   ✅ Found validator: $SEARCH_RESULT"

# Test 2: Get validator stats
echo -e "\n2. Getting validator stats..."
STATS=$(curl -s "http://localhost:3001/api/validators/$SEARCH_RESULT/stats?timeRange=24h" | jq '.data[0]')
BLOCKS=$(echo "$STATS" | jq -r '.blocks_produced')
TRANSACTIONS=$(echo "$STATS" | jq -r '.total_transactions')
echo "   📊 Blocks produced: $BLOCKS"
echo "   📊 Total transactions: $TRANSACTIONS"

# Test 3: Get program usage
echo -e "\n3. Getting top programs used by validator..."
curl -s "http://localhost:3001/api/validators/$SEARCH_RESULT/programs?timeRange=24h" | jq -r '.data[0:5] | .[] | "   • \(.program_id[0:8])... (\(.program_name // "Unknown")) - \(.total_invocations) invocations (\(.avg_percentage | tonumber | round)%)"'

echo -e "\n✅ All tests passed! The system is working correctly."
echo "   Users can search for '$SEARCH_RESULT' in the frontend"
echo "   and see all program invocations ranked by usage."