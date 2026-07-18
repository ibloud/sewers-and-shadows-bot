/**
 * VIOLET PERSONA — thin wrapper around personaEngine.js pointed at
 * Violet's voice. See personaEngine.js for the shared mechanics;
 * see config/violet-system-prompt.md for everything character-specific.
 */

'use strict';

const path = require('path');
const { createPersona } = require('./personaEngine.js');

module.exports = createPersona({
  systemPromptPath: path.join(__dirname, '..', 'config', 'violet-system-prompt.md'),
});
