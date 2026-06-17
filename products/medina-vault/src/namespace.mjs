// namespace.mjs — identity-aware key prefixing so the operator's writes,
// the AI's writes, and the system's writes don't get mixed.
//
// RULE:
//   if agent_id === operator        → prefix "operator/"
//   if agent_id === "system"        → prefix "system/"
//   else                            → prefix "ai/<agent_id>/"
//
// Already-prefixed keys (e.g., user calls vault_store key="ai/claude/foo")
// are left alone — explicit override.

const NAMESPACES = ['operator/', 'system/', 'ai/', 'shared/', 'consolidated/',
                    'agents/', 'artifact/', 'packages/', 'failures/', 'decisions/',
                    'doctrine/', 'identity/', 'learning/', 'contract/', 'api/'];

export function namespaced(key, agent_id, operator) {
  if (!key) return key;
  // Don't double-prefix if the key already has a known namespace prefix
  for (const ns of NAMESPACES) if (key.startsWith(ns)) return key;

  if (!agent_id) return `unknown/${key}`;
  if (agent_id === operator) return `operator/${key}`;
  if (agent_id === 'system') return `system/${key}`;
  return `ai/${agent_id}/${key}`;
}

export function whoOwns(key) {
  if (key.startsWith('operator/')) return { ns: 'operator' };
  if (key.startsWith('system/'))   return { ns: 'system' };
  if (key.startsWith('ai/')) {
    const parts = key.split('/');
    return { ns: 'ai', agent: parts[1] };
  }
  for (const ns of NAMESPACES) if (key.startsWith(ns)) return { ns: ns.slice(0, -1) };
  return { ns: 'unknown' };
}
