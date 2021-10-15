const Config = require('./config'),
  Glob = require('glob-promise'),
  Cheerio = require('cheerio'),
  Marked = require("marked"),
  Path = require('path'),
  Util = require('util'),
  exec = Util.promisify(require('child_process').exec),
  Fs = require('fs').promises;

!async function () {

  // verify that all paths exist
  for (const prop of ['widocoPath', 'ontFile', 'textFolder', 'confFile']) {
    if (!(await fileExists(Config[prop]))) {
      throw Error(`Could not find ${prop} at location ${Config.widocoPath}`);
    }
  }

  // common objects
  const $ = Cheerio.load('<div id="root"></div>');
  let path, raw;

  // initial run of Widoco
  const { stdout, stderr } = await exec(`java -jar ${Config.widocoPath} -ontFile "${Config.ontFile}" -outFolder "${Config.outPath}" -confFile "${Config.confFile}" -webVowl -displayDirectImportsOnly -rewriteAll`);
  console.log( stderr )
  if (!stdout.includes('Documentation generated successfully')) {
    return;
  }
  console.log('Generated base Widoco documentation');

  // replace text files
  console.log('Replacing text in sections');
  const textFiles = await Glob('*.md', { cwd: Config.textFolder });
  const sectionFolder = Path.join(Config.outPath, 'sections');
  for (const f of textFiles) {

    // skip acknowledgments; will be handled differently at the end
    if( f == 'acknowledgements.md' ) {
      continue;
    }

    // path to target file
    const targetFile = f.replace('.md', '-en.html'),
          targetPath = Path.join(sectionFolder, targetFile);

    // skip files without equivalent
    if (!(await fileExists(targetPath))) {
      console.log(`   unknown target file: ${targetFile}`)
      continue;
    }

    // load the source file
    const source = await Fs.readFile(Path.join(Config.textFolder, f), 'utf8')

    // store the results in the target file
    const target = await Fs.readFile(targetPath, 'utf8');
    $('#root').html(target);
    $('.markdown').html(source);
    await Fs.writeFile(targetPath, $('#root').html());
    console.log(`   appended to ${targetFile}`);

  }

  // acknowledgements work differently
  path = Path.join(Config.outPath, 'index-en.html');
  raw = await Fs.readFile(path, 'utf8');
  $('#root').html(raw);
  raw = await Fs.readFile(Path.join(Config.textFolder, 'acknowledgements.md'), 'utf8');
  // clean out the old ack
  $('#acknowledgements').find( 'p:not(:nth-of-type(1))' ).remove(); // first <p> is Widoco acknowledgement
  $('#acknowledgements') // https://stackoverflow.com/a/6520267/1169798
    .contents()
    .filter( function() {
      return this.nodeType == 3; // Node.TEXT_NODE == 3
    } )
    .remove();
  // add the new ack
  $('#acknowledgments').append(Marked(raw));
  await Fs.writeFile(path, $('#root').html());
  console.log('   index-en.html');

  // cleanup - overview-en.html
  console.log('Cleaning up files')
  path = Path.join(Config.outPath, 'sections', 'overview-en.html');
  raw = await Fs.readFile(path, 'utf8');
  $('#root').html(raw);
  $('li')
    .each((_, li) => {
      const $li = $(li);
      if ($li.find('a[href^="#http"]').length > 0) {
        $li.remove();
      }
    });
  await Fs.writeFile(path, $('#root').html());
  console.log('   overview-en.html');

  // cleanup - crossref-en.html
  path = Path.join(Config.outPath, 'sections', 'crossref-en.html');
  raw = await Fs.readFile(path, 'utf8');
  $('#root').html(raw);
  $('#annotationproperties li')
    .each((_, li) => {
      const $li = $(li);
      if ($li.find('a[href^="#http"]').length > 0) {
        $li.remove();
      }
    });
  $('.entity[id^="http"]')
    .each((_, div) => $(div).remove());
  await Fs.writeFile(path, $('#root').html());
  console.log('   crossref-en.html');

  // cleanup - introduction-en.html
  path = Path.join(Config.outPath, 'sections', 'introduction-en.html');
  raw = await Fs.readFile(path, 'utf8');
  $('#root').html(raw);
  const removedNamespaces = [ 'iadopt', 'index-html', 'iso639-3', 'ontology' ];
  $('#namespacedeclarations tr')
    .each((_, tr) => {
      const $tr = $(tr);
      const ns = $tr.find('b')
      if ( (ns.length > 0) && removedNamespaces.includes( ns.text() ) ) {
        $tr.remove();
      }
    });
  await Fs.writeFile(path, $('#root').html());
  console.log('   introduction-en.html');

  // replace index file
  const indexTarget = Path.join(Config.outPath, 'index.html'),
        indexSource = Path.join(Config.outPath, 'index-en.html');
  if( await fileExists(indexTarget) ){
    await Fs.unlink(indexTarget);
  }
  await Fs.copyFile(indexSource, indexTarget);
  console.log('Copied index-en.html to index.html');

  // copy json file as json-ld to provide both
  const jsonSource = Path.join(Config.outPath, 'ontology.json'),
        jsonTarget = Path.join(Config.outPath, 'ontology.jsonld');
  await Fs.copyFile(jsonSource, jsonTarget);
  console.log('Copied ontology.json to ontology.jsonld');

}()
  .catch((e) => console.error(e));




// check, whether a file actually exists
async function fileExists(path) {
  try {
    await Fs.access(path);
    return true;
  } catch (e) {
    return false;
  }
}
