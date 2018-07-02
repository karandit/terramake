#!/usr/bin/env node
var fs = require('fs')
var temp = require('temp').track()
var compiler = require('node-elm-compiler')
var meow = require('meow')

var cli = meow(`
    Usage
      $ terramake
`)

if (!fs.existsSync('./elm-package.json')) {
  fail('Error: This command needs to be executed from the root of the elm project.')
}

var sourcePath = cli.input[0]
var targetPath = temp.path({ suffix: '.js' })
compiler.compileSync([sourcePath], {
  yes: true,
  output: targetPath,
  processOpts: { stdio: 'pipe' }
})
var Elm = require(targetPath)
var app = Elm.Main.worker()

function fail (msg) {
  process.stderr.write(msg)
  process.exit(1)
}
