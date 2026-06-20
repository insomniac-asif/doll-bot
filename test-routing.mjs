import { isManagementRequest } from './src/features/toolRouter.js';
const cases = [
  ['post a reminder in #general every monday at 9am', true],
  ['schedule a message tomorrow at noon', true],
  ['create an event for game night friday at 8pm', true],
  ['set the timezone to EST', true],
  ['bassboost the music', true],
  ['turn on autoplay', true],
  ['get the lyrics', true],
  ['save this as a playlist called chill', true],
  ['when someone says ip reply with the server ip', true],
  ['give @bob the vip role for 2 hours', true],
  ['who invited @newguy', true],
  ['set up automod to block these words: spam, scam', true],
  ['turn on anti-scam', true],
  ['i have a suggestion: add more channels', true],
  ['set up modmail with the staff role', true],
  ['create a staff application', true],
  ['i want to apply for staff', true],
  // negatives
  ['this music slaps', false],
  ['good night everyone', false],
];
let pass = 0;
for (const [t, exp] of cases) { const g = isManagementRequest(t); const ok = g === exp; if (ok) pass++; console.log(`${ok?'PASS':'FAIL'} [${g}] "${t}"`); }
console.log(`\n${pass}/${cases.length} passed`);
