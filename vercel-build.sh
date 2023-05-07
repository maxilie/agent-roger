#!/bin/bash

# vercel-build.sh
set -e

# Rename .eslintrc.cjs to .eslintrc.original.cjs
mv packages/dashboard/.eslintrc.cjs packages/dashboard/.eslintrc.original.cjs

# Rename .eslintrc.vercel.cjs to .eslintrc.cjs
mv packages/dashboard/.eslintrc.vercel.cjs packages/dashboard/.eslintrc.cjs

# Run the build
yarn run build:dashboard-prod

# Restore the original .eslintrc.cjs file
# mv .eslintrc.original.cjs .eslintrc.cjs