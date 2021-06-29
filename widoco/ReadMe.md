# Generate Widoco documentation

* Make sure Java is installed
* Download latest jar file from https://github.com/dgarijo/Widoco/releases

Run
```
java -jar ./widoco-1.4.14-jar-with-dependencies.jar -ontFile ../i-adopt.owl -outFolder ../../i-adopt.github.io/ -confFile ./widoco.conf -htaccess -webVowl -includeAnnotationProperties -displayDirectImportsOnly -uniteSections
```

*Used paths for input and outputs might need to be adjusted.*

## Adjustments

Please make adjustments only to the configuration file and/or in this file to keep track of the changes!
