import crypto from 'node:crypto';

export const X_PERMISSIONS = Object.freeze({
  MISSION_EXECUTE:  'mission:execute',
  MISSION_READ:     'mission:read',
  PROTOCOL_ACCESS:  'protocol:access',
  PLATFORM_READ:    'platform:read',
  PLATFORM_WRITE:   'platform:write',
  MICROBOT_SPAWN:   'microbot:spawn',
  MICROBOT_CONTROL: 'microbot:control',
  GOVERNANCE_READ:  'governance:read',
  GOVERNANCE_WRITE: 'governance:write',
  AUDIT_READ:       'audit:read',
  ADMIN:            'admin',
});

const ROLE_PERMISSIONS = Object.freeze({
  viewer: [
    X_PERMISSIONS.MISSION_READ,
    X_PERMISSIONS.PLATFORM_READ,
    X_PERMISSIONS.PROTOCOL_ACCESS,
  ],
  operator: [
    X_PERMISSIONS.MISSION_EXECUTE,
    X_PERMISSIONS.MISSION_READ,
    X_PERMISSIONS.PROTOCOL_ACCESS,
    X_PERMISSIONS.PLATFORM_READ,
    X_PERMISSIONS.PLATFORM_WRITE,
    X_PERMISSIONS.MICROBOT_SPAWN,
  ],
  admin: Object.values(X_PERMISSIONS),
});

export class XTenant {
  #tenantId;
  #userId;
  #role;
  #permissions;
  #platformAccess;
  #quotas;
  #context;
  #createdAt;

  /**
   * @param {{
   *   tenantId?:       string,
   *   userId?:         string,
   *   role?:           'viewer'|'operator'|'admin',
   *   permissions?:    string[],
   *   platformAccess?: string[],
   *   quotas?:         object,
   *   context?:        object,
   * }} opts
   */
  constructor({
    tenantId,
    userId,
    role = 'operator',
    permissions,
    platformAccess = ['*'],
    quotas = {},
    context = {},
  } = {}) {
    this.#tenantId       = tenantId ?? `tenant-${crypto.randomUUID().slice(0, 8)}`;
    this.#userId         = userId   ?? `user-${crypto.randomUUID().slice(0, 8)}`;
    this.#role           = role;
    this.#permissions    = new Set(permissions ?? ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.operator);
    this.#platformAccess = new Set(platformAccess);
    this.#quotas = {
      maxMissionsPerMinute: 100,
      maxMicrobots:         10,
      maxPlatforms:         20,
      ...quotas,
    };
    this.#context   = { ...context };
    this.#createdAt = new Date().toISOString();
  }

  get tenantId()   { return this.#tenantId; }
  get userId()     { return this.#userId; }
  get role()       { return this.#role; }
  get quotas()     { return { ...this.#quotas }; }
  get context()    { return { ...this.#context }; }
  get createdAt()  { return this.#createdAt; }
  get permissions(){ return [...this.#permissions]; }
  get platforms()  { return [...this.#platformAccess]; }

  /** @param {string} permission */
  hasPermission(permission) {
    return this.#permissions.has(X_PERMISSIONS.ADMIN) || this.#permissions.has(permission);
  }

  /** @param {string} platform */
  canAccessPlatform(platform) {
    return this.#platformAccess.has('*') || this.#platformAccess.has(platform);
  }

  toJSON() {
    return {
      tenantId:      this.#tenantId,
      userId:        this.#userId,
      role:          this.#role,
      permissions:   [...this.#permissions],
      platformAccess:[...this.#platformAccess],
      quotas:        this.#quotas,
      context:       this.#context,
      createdAt:     this.#createdAt,
    };
  }

  static get PERMISSIONS() { return X_PERMISSIONS; }
  static get ROLES()       { return ROLE_PERMISSIONS; }
}

export default XTenant;
