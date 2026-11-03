#!/usr/bin/env bash
# ====================================================================
# Verde Roatán Plant Intelligence · Supabase Database Deployment Script
# Usage:
#   ./update-supabase.sh
#   OR
#   DATABASE_URL="postgresql://..." ./update-supabase.sh
# ====================================================================

set -e

echo ""
echo "======================================================================="
echo "  VERDE ROATÁN · AUTOMATED SUPABASE DATABASE MIGRATION SCRIPT"
echo "======================================================================="
echo ""

# Check if node and npm/tsx are installed
if ! command -v npx &> /dev/null; then
    echo "[ERROR] npx is required but not installed. Please install Node.js."
    exit 1
fi

# Run the TypeScript database update script
npx tsx scripts/update-supabase.ts "$@"
