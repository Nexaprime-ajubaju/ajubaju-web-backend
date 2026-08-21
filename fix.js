const fs = require('fs');
const path = 'src/recommendation-engine/retrievers/candidate-retriever.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/status: \{ \$in: \['approved', 'active'\] \}/g, "status: { $in: ['approved', 'active'] }, endDate: { $gte: new Date() }");
fs.writeFileSync(path, content);
console.log("Fixed CandidateRetrieverService");
