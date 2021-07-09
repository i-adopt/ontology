const Config = require('./config'),
  Glob = require('glob-promise'),
  Cheerio = require('cheerio'),
  Marked = require("marked"),
  Path = require('path'),
  Util = require('util'),
  exec = Util.promisify(require('child_process').exec),
  Fs = require('fs').promises;

!async function () {

  // verify that all path exist
  for (const prop of ['widocoPath', 'ontFile', 'textFolder', 'confFile']) {
    if (!(await fileExists(Config[prop]))) {
      throw Error(`Could not find ${prop} at location ${Config.widocoPath}`);
    }
  }

  // common objects
  const $ = Cheerio.load('<div id="root"></div>');
  let path, raw;

  // initial run of Widoco
  const { stdout, stderr } = await exec(`java -jar ${Config.widocoPath} -ontFile "${Config.ontFile}" -outFolder '${Config.outPath}' -confFile "${Config.confFile}" -webVowl -includeAnnotationProperties -displayDirectImportsOnly -rewriteAll`);
  if (!stdout.includes('Documentation generated successfully')) {
    console.log(stderr);
    return;
  }
  console.log('Generated base Widoco documentation');

  // replace text files
  console.log('Replacing text in sections');
  const textFiles = await Glob('*.md', { cwd: Config.textFolder });
  const sectionFolder = Path.join(Config.outPath, 'sections');
  for (const f of textFiles) {

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
  $('#acknowledgements').append(Marked(raw));
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

  // replace index file
  const indexTarget = Path.join(Config.outPath, 'index.html'),
    indexSource = Path.join(Config.outPath, 'index-en.html');
  await Fs.unlink(indexTarget);
  await Fs.copyFile(indexSource, indexTarget);
  console.log('Copied index-en.html to index.html');

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
