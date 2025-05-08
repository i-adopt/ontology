const Path = require('path');
module.exports = {

  // ontology prefix
  ontoPrefix: 'https://w3id.org/iadopt/ont/',

  // redirect output to
  outPath: Path.join(__dirname, '..', '..', 'docs'),

  // path to the widoco executable
  widocoPath: Path.join(__dirname, '..', '..', '..', 'widoco-1.4.25-jar-with-dependencies_JDK-11.jar'),

  // path to the ontology file
  ontFile: Path.join(__dirname, '..', '..', 'ontology', 'i-adopt.ttl'),

  // path to the widoco configuration
  confFile: Path.join(__dirname, '..', '..', 'widoco', 'widoco.conf'),

  // path to the texts
  textFolder: Path.join(__dirname, '..', '..', 'widoco', 'texts'),

};
