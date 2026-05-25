/**
 * ExtensionBuilder — Fluent Builder for Browser Extensions
 *
 * Creates Manifest V3 compliant browser extension configurations
 * using the builder pattern for a clean, chainable API.
 *
 * Example:
 *   const manifest = new ExtensionBuilder()
 *     .setName('My Extension')
 *     .setVersion('1.0.0')
 *     .setDescription('AI-powered extension')
 *     .addPermission('storage')
 *     .addPermission('activeTab')
 *     .setBackgroundScript('background.js')
 *     .addContentScript(['<all_urls>'], ['content.js'])
 *     .build();
 */

'use strict';

class ExtensionBuilder {
  constructor() {
    this.manifest = {
      manifest_version: 3,
      name: '',
      version: '1.0.0',
      description: '',
      permissions: [],
      icons: {},
    };
    this.files = {};
  }

  /**
   * Set extension name
   * @param {string} name - Extension name
   * @returns {ExtensionBuilder}
   */
  setName(name) {
    this.manifest.name = name;
    return this;
  }

  /**
   * Set extension version
   * @param {string} version - Semantic version (e.g., '1.0.0')
   * @returns {ExtensionBuilder}
   */
  setVersion(version) {
    this.manifest.version = version;
    return this;
  }

  /**
   * Set extension description
   * @param {string} description - Extension description
   * @returns {ExtensionBuilder}
   */
  setDescription(description) {
    this.manifest.description = description;
    return this;
  }

  /**
   * Add a permission
   * @param {string} permission - Permission name (e.g., 'storage', 'activeTab')
   * @returns {ExtensionBuilder}
   */
  addPermission(permission) {
    if (!this.manifest.permissions.includes(permission)) {
      this.manifest.permissions.push(permission);
    }
    return this;
  }

  /**
   * Add multiple permissions
   * @param {string[]} permissions - Array of permission names
   * @returns {ExtensionBuilder}
   */
  addPermissions(permissions) {
    for (const perm of permissions) {
      this.addPermission(perm);
    }
    return this;
  }

  /**
   * Add a host permission
   * @param {string} pattern - URL pattern (e.g., 'https://*.example.com/*')
   * @returns {ExtensionBuilder}
   */
  addHostPermission(pattern) {
    if (!this.manifest.host_permissions) {
      this.manifest.host_permissions = [];
    }
    if (!this.manifest.host_permissions.includes(pattern)) {
      this.manifest.host_permissions.push(pattern);
    }
    return this;
  }

  /**
   * Set background service worker
   * @param {string} script - Service worker filename
   * @returns {ExtensionBuilder}
   */
  setBackgroundScript(script) {
    this.manifest.background = {
      service_worker: script,
    };
    return this;
  }

  /**
   * Add a content script configuration
   * @param {string[]} matches - URL patterns to match
   * @param {string[]} js - JavaScript files to inject
   * @param {string[]} [css] - CSS files to inject (optional)
   * @returns {ExtensionBuilder}
   */
  addContentScript(matches, js, css = []) {
    if (!this.manifest.content_scripts) {
      this.manifest.content_scripts = [];
    }

    const config = { matches, js };
    if (css.length > 0) {
      config.css = css;
    }

    this.manifest.content_scripts.push(config);
    return this;
  }

  /**
   * Set icon paths
   * @param {Object} icons - Icon size to path mapping (e.g., { '16': 'icon16.png' })
   * @returns {ExtensionBuilder}
   */
  setIcons(icons) {
    this.manifest.icons = icons;
    return this;
  }

  /**
   * Set standard icon paths (16, 48, 128)
   * @param {string} [prefix='icons/icon'] - Icon path prefix
   * @returns {ExtensionBuilder}
   */
  setStandardIcons(prefix = 'icons/icon') {
    this.manifest.icons = {
      '16': `${prefix}16.png`,
      '48': `${prefix}48.png`,
      '128': `${prefix}128.png`,
    };
    return this;
  }

  /**
   * Set popup HTML
   * @param {string} popup - Popup HTML filename
   * @returns {ExtensionBuilder}
   */
  setPopup(popup) {
    if (!this.manifest.action) {
      this.manifest.action = {};
    }
    this.manifest.action.default_popup = popup;
    return this;
  }

  /**
   * Set action title
   * @param {string} title - Action title
   * @returns {ExtensionBuilder}
   */
  setActionTitle(title) {
    if (!this.manifest.action) {
      this.manifest.action = {};
    }
    this.manifest.action.default_title = title;
    return this;
  }

  /**
   * Set action icons
   * @param {Object} icons - Icon size to path mapping
   * @returns {ExtensionBuilder}
   */
  setActionIcons(icons) {
    if (!this.manifest.action) {
      this.manifest.action = {};
    }
    this.manifest.action.default_icon = icons;
    return this;
  }

  /**
   * Enable side panel
   * @param {string} path - Side panel HTML path
   * @returns {ExtensionBuilder}
   */
  setSidePanel(path) {
    this.manifest.side_panel = {
      default_path: path,
    };
    if (!this.manifest.permissions.includes('sidePanel')) {
      this.manifest.permissions.push('sidePanel');
    }
    return this;
  }

  /**
   * Enable DevTools integration
   * @param {string} page - DevTools HTML page
   * @returns {ExtensionBuilder}
   */
  setDevTools(page) {
    this.manifest.devtools_page = page;
    return this;
  }

  /**
   * Set minimum Chrome version
   * @param {string} version - Minimum Chrome version (e.g., '116')
   * @returns {ExtensionBuilder}
   */
  setMinimumChromeVersion(version) {
    this.manifest.minimum_chrome_version = version;
    return this;
  }

  /**
   * Add a file to be generated with the extension
   * @param {string} filename - File name
   * @param {string} content - File content
   * @returns {ExtensionBuilder}
   */
  addFile(filename, content) {
    this.files[filename] = content;
    return this;
  }

  /**
   * Add web accessible resources
   * @param {string[]} resources - Resource paths
   * @param {string[]} matches - URL patterns
   * @returns {ExtensionBuilder}
   */
  addWebAccessibleResources(resources, matches = ['<all_urls>']) {
    if (!this.manifest.web_accessible_resources) {
      this.manifest.web_accessible_resources = [];
    }
    this.manifest.web_accessible_resources.push({
      resources,
      matches,
    });
    return this;
  }

  /**
   * Set commands (keyboard shortcuts)
   * @param {Object} commands - Commands configuration
   * @returns {ExtensionBuilder}
   */
  setCommands(commands) {
    this.manifest.commands = commands;
    return this;
  }

  /**
   * Set options page
   * @param {string} page - Options page HTML
   * @returns {ExtensionBuilder}
   */
  setOptionsPage(page) {
    this.manifest.options_page = page;
    return this;
  }

  /**
   * Use a preset configuration
   * @param {string} preset - Preset name ('minimal', 'standard', 'full')
   * @returns {ExtensionBuilder}
   */
  usePreset(preset) {
    switch (preset) {
      case 'minimal':
        return this
          .addPermissions(['activeTab', 'storage'])
          .setBackgroundScript('background.js')
          .setStandardIcons()
          .setMinimumChromeVersion('116');

      case 'standard':
        return this
          .addPermissions(['activeTab', 'storage', 'alarms'])
          .setBackgroundScript('background.js')
          .addContentScript(['<all_urls>'], ['content.js'])
          .setStandardIcons()
          .setPopup('popup.html')
          .setMinimumChromeVersion('116');

      case 'full':
        return this
          .addPermissions(['activeTab', 'storage', 'alarms', 'tabs', 'scripting', 'sidePanel'])
          .setBackgroundScript('background.js')
          .addContentScript(['<all_urls>'], ['content.js'])
          .setStandardIcons()
          .setPopup('popup.html')
          .setSidePanel('sidepanel.html')
          .setDevTools('devtools.html')
          .setMinimumChromeVersion('116');

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }

  /**
   * Validate the manifest configuration
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.manifest.name) {
      errors.push('Extension name is required');
    }

    if (!this.manifest.version) {
      errors.push('Extension version is required');
    }

    if (this.manifest.manifest_version !== 3) {
      errors.push('manifest_version must be 3');
    }

    const hasBackground = this.manifest.background?.service_worker;
    const hasContent = this.manifest.content_scripts?.length > 0;

    if (!hasBackground && !hasContent) {
      errors.push('Extension must have a background script or content scripts');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build the final manifest object
   * @returns {Object} - Complete manifest configuration
   */
  build() {
    const { valid, errors } = this.validate();
    if (!valid) {
      throw new Error(`Invalid manifest: ${errors.join(', ')}`);
    }

    // Clean up empty arrays/objects
    const manifest = { ...this.manifest };
    if (manifest.permissions && manifest.permissions.length === 0) {
      delete manifest.permissions;
    }
    if (manifest.icons && Object.keys(manifest.icons).length === 0) {
      delete manifest.icons;
    }

    return manifest;
  }

  /**
   * Build and return manifest with associated files
   * @returns {{ manifest: Object, files: Object }}
   */
  buildWithFiles() {
    return {
      manifest: this.build(),
      files: this.files,
    };
  }

  /**
   * Create a new builder from an existing manifest
   * @param {Object} manifest - Existing manifest object
   * @returns {ExtensionBuilder}
   */
  static fromManifest(manifest) {
    const builder = new ExtensionBuilder();
    builder.manifest = { ...manifest };
    return builder;
  }
}

module.exports = ExtensionBuilder;
