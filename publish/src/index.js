const Config = require('./config'),
      Cheerio = require('cheerio'),
      DateTime = require( 'luxon' ).DateTime,
      Glob = require('glob').glob,
      Marked = require('marked'),
      Mkdir = require( 'mkdirp' ).mkdirp,
      Props = require('properties-reader'),
      Rdf = require( 'rdflib'),
      Fs = require('fs').promises,
      Path = require( 'path' ),
      Util = require('util'),
      exec = Util.promisify(require('child_process').exec);


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

  /* XXXXXXXXXXXXXXXXXXXXXXXXXXXX PREPARATION XXXXXXXXXXXXXXXXXXXXXXXXXXXX */

  // get ontology version number
  let ontoVersion;
  {
    const onto = Rdf.graph();
    const ontoRaw = await Fs.readFile( Config.ontFile, 'utf8' );
    Rdf.parse(ontoRaw, onto, 'https://w3id.org/iadopt/ont', 'text/turtle' );
    ontoVersion = onto.any(
      Rdf.sym( 'https://w3id.org/iadopt/ont' ),
      Rdf.sym( 'http://www.w3.org/2002/07/owl#versionInfo'),
      undefined,
      Rdf.sym('https://w3id.org/iadopt/ont')
    ).value;
  }

  // create a copy of the ontology using the version number
  {
    const canonicalOntoVersion = ontoVersion.replace( /\./g, '_' );
    const versionedPath = Path.join(
      Path.dirname( Config.ontFile ),
      Path.basename( Config.ontFile.replace( Path.extname( Config.ontFile ), `_${canonicalOntoVersion}.ttl` ) )
    );
    await Fs.copyFile( Config.ontFile, versionedPath );
    console.log( `Stored versioned ontology under ${versionedPath}` );
  }

  // adjust Widoco config file
  {

    // get all available versions
    const ontoFiles = await Glob( '*.ttl', { cwd: Path.dirname( Config.ontFile ) } );
    const ontoVersions = ontoFiles
      .map( (f) => f.match( /i-adopt_(\d+_\d+_\d+).ttl/i ) )  // all versions of our ontology
      .filter( (f) => f )                                     // only include actual matches
      .map( (v) => v[1].replace( /_/g, '.' ) )
      .sort();

    // get previous version number
    const prevOntoVersion = ontoVersions[ ontoVersions.indexOf( ontoVersion ) - 1 ];

    // replace in Widoco property file
    const widocoProps = Props( Config.confFile );
    widocoProps.set( 'thisVersionURI', Config.ontoPrefix + ontoVersion );
    widocoProps.set( 'previousVersionURI', Config.ontoPrefix + prevOntoVersion );
    widocoProps.set( 'dateOfRelease', DateTime.now().setLocale('en').toLocaleString( DateTime.DATE_FULL ) );
    const citeAsRegexp = new RegExp( `${Config.ontoPrefix.replace( /\//g, '\\/' )}\\d+\\.\\d+\\.\\d+`, 'i' );
    const citeAs = widocoProps.get( 'citeAs' ).replace( citeAsRegexp, Config.ontoPrefix + ontoVersion );
    widocoProps.set( 'citeAs', citeAs );
    await widocoProps.save( Config.confFile );
    console.log( `Updated Widoco properties file to version ${ontoVersion}` );

  }

  /* XXXXXXXXXXXXXXXXXXXXXXXXXXXX DOCUMENTATION XXXXXXXXXXXXXXXXXXXXXXXXXXXX */

  // initial run of Widoco
  const { stdout, stderr } = await exec(`java -jar ${Config.widocoPath} -ontFile "${Config.ontFile}" -outFolder "${Config.outPath}" -confFile "${Config.confFile}" -webVowl -displayDirectImportsOnly -rewriteAll`);
  console.log( stderr );
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
      console.log(`   unknown target file: ${targetFile}`);
      continue;
    }

    // load the source file
    const source = await Fs.readFile(Path.join(Config.textFolder, f), 'utf8');
    const parsed = Marked.parse( source );

    // store the results in the target file
    const target = await Fs.readFile(targetPath, 'utf8');
    $('#root').html(target);
    $('.markdown').html(parsed);
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
  $('#acknowledgments').append(Marked.parse(raw));
  await Fs.writeFile(path, $('#root').html());
  console.log('   index-en.html');

  // replace webvowl by custom SVG
  path = Path.join(Config.outPath, 'sections', 'overview-en.html');
  raw = await Fs.readFile(path, 'utf8');
  $('#root').html(raw);
  raw = await Fs.readFile(Path.join(Config.textFolder, 'IAdopt.svg'), 'utf8');
  // clean out the old webvowl
  $('iframe').remove(); // first <p> is Widoco acknowledgement
  // add the new SVG
  $('#root').append(`
    <div style="text-align: center; padding: 2em;">
      ${raw}
    </div>
  `);
  await Fs.writeFile(path, $('#root').html());
  console.log('   overview-en.html');


  // cleanup - overview-en.html
  console.log('Cleaning up files');
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
  // remove namespace table
  $('#namespacedeclarations').remove();
  await Fs.writeFile(path, $('#root').html());
  console.log('   introduction-en.html');

  /* XXXXXXXXXXXXXXXXXXXXXXXXXXXX COMBINATION XXXXXXXXXXXXXXXXXXXXXXXXXXXX */

  path = Path.join(Config.outPath, 'index-en.html' );
  raw = await Fs.readFile(path, 'utf8');
  const jQuery = Cheerio.load(raw);

  // after widoco sources
  function loadTOC(){
    //process toc dynamically
    var t='<h2>Table of contents</h2><ul>', i = 1, j=0;
    jQuery('.list').each(function(){
      // https://stackoverflow.com/a/8851526/1169798
      const text = jQuery(this)
        .clone()
        .children()
        .remove()
        .end()
        .text();
      if(jQuery(this).is('h2')){
        if(j>0){
          t+='</ul>';
          j=0;
        }
        t+= '<li>'+i+'. <a href=#'+ jQuery(this).attr('id')+'>'+ text +'</a></li>';
        i++;
      }
      if(jQuery(this).is('h3')){
        if(j==0){
          t+='<ul>';
        }
        j++;
        t+= '<li>'+(i-1)+'.'+j+'. '+'<a href=#'+ jQuery(this).attr('id')+'>'+ text +'</a></li>';
      }
    });
    t+='</ul>';
    jQuery('#toc').html(t);
  }

  // combine all files
  console.log( 'Combining files' );
  for( const section of [ 'abstract', 'introduction', 'overview', 'description', 'references', 'changelog', 'crossref' ]) {
    path = Path.join(Config.outPath, 'sections', `${section}-en.html`);
    raw = await Fs.readFile(path, 'utf8');
    jQuery(`#${section}`).html( raw );
  }
  loadTOC();

  // remove now unused script tag
  jQuery( 'script:not([type="application/ld+json"])' ).remove();

  // write back to file
  path = Path.join(Config.outPath, 'index-en.html' );
  await Fs.writeFile(path, jQuery.html());
  console.log( `   written to ${path}` );

  /* XXXXXXXXXXXXXXXXXXXXXXXXXXXX POSTPROCESSING XXXXXXXXXXXXXXXXXXXXXXXXXXXX */

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


  /* XXXXXXXXXXXXXXXXXXXXXXXXXXXX ARCHIVE XXXXXXXXXXXXXXXXXXXXXXXXXXXX */

  // create an archive copy
  const docFiles = (await Glob( '**/*.*', { cwd: Config.outPath } ))
    .filter( (f) => !f.startsWith( 'archive' ) && !f.endsWith( '.md' ) );
  const baseArchivePath = Path.join( Config.outPath, 'archive', ontoVersion );
  await Mkdir( baseArchivePath );
  for( const file of docFiles ) {
    const targetPath = Path.join( baseArchivePath, file );
    await Mkdir( Path.dirname( targetPath) );
    await Fs.copyFile(
      Path.join( Config.outPath, file ),
      targetPath
    );
  }
  console.log( `Moved ${docFiles.length} files to archive folder ${baseArchivePath}` );

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
