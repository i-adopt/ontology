# Publication Script

The scripts included here are used to automate the process of publishing the IAdopt ontology.

1. Download the [Widoco exexcutable JAR file](https://github.com/dgarijo/WIDOCO/releases/latest)
1. Configure all parameters in `src/config.js`, in particular make sure all paths are accurate.
1. Run `npm run prepare` to generate all files and apply the corrections
1. Check for warnings etc.
1. Commit the `i-adopt.github.io` repository.


## Fixes

The following fixes are applied which currently are difficult to impossible with [Widoco](http://dgarijo.github.io/Widoco/):

* Include custom abstract / description / introduction / references from `/widoco/texts`
* Remove descriptions outside of the ontology
