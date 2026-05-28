/**
 * Sovereign Organism — Builders Module
 *
 * A comprehensive suite of builder patterns and scaffolding tools:
 *
 * 1. Builder Pattern Classes
 *    - ExtensionBuilder: Fluent builder for browser extension manifests
 *    - SDKBuilder: Fluent builder for SDK packages
 *    - ConfigBuilder: Fluent builder for configuration objects
 *    - WorkflowBuilder: Fluent builder for GitHub Actions workflows
 *
 * 2. CLI Scaffolding
 *    - create-extension: Generate new browser extension boilerplate
 *    - create-sdk: Generate new SDK package boilerplate
 *    - create-workflow: Generate new GitHub Actions workflow
 *
 * Usage:
 *   const { ExtensionBuilder, SDKBuilder } = require('./builders');
 *
 *   const extension = new ExtensionBuilder()
 *     .setName('My Extension')
 *     .setVersion('1.0.0')
 *     .addPermission('storage')
 *     .build();
 */

'use strict';

// Builder Pattern Classes
const ExtensionBuilder = require('./patterns/extension-builder');
const SDKBuilder = require('./patterns/sdk-builder');
const ConfigBuilder = require('./patterns/config-builder');
const WorkflowBuilder = require('./patterns/workflow-builder');

// CLI Scaffolding Tools
const createExtension = require('./cli/create-extension');
const createSDK = require('./cli/create-sdk');
const createWorkflow = require('./cli/create-workflow');

// Build Automation
const BuildRunner = require('./automation/build-runner');

module.exports = {
  // Builder Patterns
  ExtensionBuilder,
  SDKBuilder,
  ConfigBuilder,
  WorkflowBuilder,

  // CLI Tools
  createExtension,
  createSDK,
  createWorkflow,

  // Automation
  BuildRunner,
};
