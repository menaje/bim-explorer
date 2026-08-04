"use strict";

const vscode = require("vscode");
const {
  activateBimExplorerExtension,
} = require("./src/provider.js");

function activate(context) {
  return activateBimExplorerExtension(vscode, context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
