# metalsmith-incremental

Faster incremental builds for MetalSmith

# Install

````sh
npm i metalsmith-incremental
````

# Usage

1. Find out which is the slow part of your build.
**Hint:** Go and checkout (`metalsmith-timer`)[https://www.npmjs.com/package/metalsmith-timer]
This will give you insights in your concrete bottleneck.

2. Wrap your plugin middleware with `metalsmith-incremental`, like:

````js
import metalsmith from 'metalsmith'
// import any plugins here
// ...
import incremental from 'metalsmith-incremental'

// wrap slow plugins
metalsmith.use(incremental(slowPlugin()))

// build metalsmith
metalsmith.build((err) => {
  if (err) throw err
})

// optionally enable watching
if(process.env.NODE_ENV === 'development') {
    incremental.watch(metalsmith)
}
````

3. In case your plugin wraps content which could include other content (dependencies), you can specify custom `RegExp` or `Function`, which should extract those depended files and occashionally rebuild them too.

````js
// wrap slow plugins with RegEx
metalsmith.use(incremental(slowPlugin()), /^import ["'](.*)['"]$/mg)
````

**Important:** Your RegEx has to define one capturing group (which holds the dependency path data), match global and multiline.

````js
// wrap slow plugins with RegEx
metalsmith.use(incremental(slowPlugin()), (file, baseDir) => {
  const dependencies = []
  // do your custom magic to find dependencies
  return dependencies
})
````

**Note:** You can also pass a hash of `RegEx` or `Function` by file extension.

4. Don't forget to enable file watching (if your are in dev mode)
````js
// optionally enable watching
if(process.env.NODE_ENV === 'development') {
    incremental.watch(metalsmith)
}
````

**Note:** You have to pass your current metalsmith instance to watch.

**Important:** This plugin is designed to be used only with MetalSmith plugins who operate on file basis. Other plugins who depend on `metadata`, etc will not benefit from this or may break.

# Credit/Inspiration
After we had very long metalsmith builds during development, it was time to seek for change.
Luckily we have found this inspiring blog post http://www.mograblog.com/2016/11/speed-up-metalsmith.html.
