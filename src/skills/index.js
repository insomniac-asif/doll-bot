// Skill loader — imports all skill files to trigger self-registration.
// Each skill file calls registerTool() at import time.

import './channelSkills.js';
import './roleSkills.js';
import './memberSkills.js';
import './modSkills.js';
import './serverSkills.js';
import './inviteSkills.js';
import './voiceSkills.js';
import './musicSkills.js';
import './infoSkills.js';
import './utilitySkills.js';
import './reactionRoleSkills.js';
import './webSkills.js';
import './featureSkills.js';
import './assistantSkills.js';
import './faqSkills.js';
import './rulesSkills.js';
import './digestSkills.js';
import './scheduleSkills.js';
import './musicPremiumSkills.js';
import './automationSkills.js';
import './supportSkills.js';
import './extraSkills.js';
import './configSkills.js';
import './awarenessSkills.js';
import './templateSkills.js';
import './visualSkills.js';

import { getToolCount } from '../features/toolRegistry.js';

console.log(`[Skills] Loaded ${getToolCount()} AI tools`);
