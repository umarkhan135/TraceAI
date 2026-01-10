#!/bin/bash
# Quick test to verify extension is ready to launch

echo "🔍 Checking TraceAI Extension Setup..."
echo ""

# Check if in extension directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in extension directory. Please run from /Users/dylan/Desktop/repos/TraceAI/extension"
    exit 1
fi

echo "✅ In extension directory"

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Run: npm install"
    exit 1
fi
echo "✅ node_modules installed"

# Check if compiled
if [ ! -d "out" ]; then
    echo "⚠️  Extension not compiled. Running: npm run compile"
    npm run compile
fi
echo "✅ Extension compiled"

# Check for required files
if [ ! -f "out/extension.js" ]; then
    echo "❌ out/extension.js missing. Run: npm run compile"
    exit 1
fi
echo "✅ out/extension.js exists"

# Check launch configuration
if [ ! -f ".vscode/launch.json" ]; then
    echo "❌ .vscode/launch.json missing"
    exit 1
fi
echo "✅ .vscode/launch.json exists"

# Check if config.json exists in main repo
if [ ! -f "../.traceai/config.json" ]; then
    echo "⚠️  ../.traceai/config.json not found"
    echo "   Run pipeline first: cd .. && python3 -m traceai.cli pipeline --repo . --pr-number 999"
else
    echo "✅ ../.traceai/config.json exists"
    GIST_ID=$(cat ../.traceai/config.json | grep gist_id | cut -d'"' -f4)
    echo "   Gist ID: $GIST_ID"
fi

echo ""
echo "🎉 Extension is ready to launch!"
echo ""
echo "📝 Next steps:"
echo "1. Open VSCode: code ."
echo "2. Open a TypeScript file (e.g., src/extension.ts)"
echo "3. Press F5 to launch Extension Development Host"
echo "4. In new window, open folder: /Users/dylan/Desktop/repos/TraceAI"
echo "5. Hover over code in pipeline/traceai/github_client.py"
echo ""
echo "📖 For detailed guide, see: EXTENSION_TESTING_GUIDE.md"
