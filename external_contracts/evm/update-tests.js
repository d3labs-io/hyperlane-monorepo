const fs = require('fs');
const path = require('path');

// Files to update
const testFiles = [
  'test/TokenBridge.test.ts',
  'test/AccessControl.test.ts',
  'test/Events.test.ts',
  'test/SystemWallet.test.ts',
  'test/TransactionIdTracker.test.ts',
  'test/UnorderedNonce.test.ts'
];

testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file} - file not found`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace lockTokens with lockTokensWithFee
  content = content.replace(/\.lockTokens\(/g, '.lockTokensWithFee(');
  
  // Replace getSystemWallet() with getSystemWallet(0)
  content = content.replace(/\.getSystemWallet\(\)/g, '.getSystemWallet(0)');
  
  // Fix releaseTokens calls - this is more complex
  // Pattern: releaseTokens(token, recipient.address, amount, txId, sourceChain, sourceAddr)
  // New:     releaseTokens(token, amount, recipient.address, txId, sourceChain, sourceAddr)
  // We need to swap the 2nd and 3rd parameters
  
  // This regex captures the releaseTokens call with its parameters
  const releaseTokensRegex = /\.releaseTokens\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,\)]+)\s*,\s*([^,\)]+)\s*\)/g;
  
  content = content.replace(releaseTokensRegex, (match, token, param2, param3, txId, sourceChain, sourceAddr) => {
    // param2 is currently recipient.address, param3 is currently amount
    // We need to swap them
    return `.releaseTokens(${token}, ${param3}, ${param2}, ${txId}, ${sourceChain}, ${sourceAddr})`;
  });
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
});

console.log('Done!');

