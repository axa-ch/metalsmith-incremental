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

// filter unmodified files
metalsmith.use(incremental({ plugin: 'filter' }))
// run slow plugins
metalsmith.use(slowPlugin())
// restore unmodified files
metalsmith.use(incremental({ plugin: 'cache' }))

// optionally enable watching
if(process.env.NODE_ENV === 'development') {
  metalsmith.use(incremental({ plugin: 'watch' }))
}

// build metalsmith
metalsmith.build((err) => {
  if (err) throw err
})
````

3. In case your plugin wraps content which could include other content (dependencies), you can specify custom `RegExp` or `Function`, which should extract those depended files and occasionally rebuild them too (`.jade` and `.pug` is supported by default).

````js
// dependencies with RegEx
metalsmith.use(incremental({
  depResolver: /^import ["'](.*)['"]$/mg
}))
metalsmith.use(slowPlugin())
````

**Important:** Your RegEx has to define one capturing group (which holds the dependency path data), match global and multiline.

````js
// dependencies with Function
metalsmith.use(incremental({
  depResolver: (file, baseDir) => {
    const dependencies = []
    // do your custom magic to find dependencies
    return dependencies
  }
}))
metalsmith.use(slowPlugin())
````

**Note:** You can also pass a hash of `RegEx` or `Function` by file extension.

4. Don't forget to enable file watching (if your are in dev mode)
````js
// optionally enable watching
if(process.env.NODE_ENV === 'development') {
  metalsmith.use(incremental({ plugin: 'watch' }))
}
````

**Important:** This plugin is designed to be used only with MetalSmith plugins who operate on file basis. Other plugins who depend on `metadata`, etc may break.

# Edge Cases

Special circumstances like dependencies, plugins renaming, deleting, adding files should be considered carefully.

## Dependencies

Let's consider you are using a template engine like `PugJS` and you are changing a `partial`, `mixin` or `extend`ed layout.
This means each file which includes those dependencies needs to be rebuild to, even if they did not change itself.

To solve these you have basically two methods to chose from:
* [Dependency Resolver config for `filter` plugin](.API.md#dependencyresolver)
* [Paths Map config for `watch` plugin](.API.md#pathsobject)

**Note**

The `Paths-Map` makes especially sense if you remove some files by `metalsmith-branch` or `metalsmith-ignore` temporarily from the pipeline (which makes them unavailable for dependency resolver) but still want to trigger updates on other files if one of those ignored files has changed.

## Renaming

If your are using any plugin like `metalsmith-markdonw` or any template engine like `PugJS` it's very likly that the original file extension changes from `.md` or `.pug` to `.html`.

To solve these just let the `cache` plugin know those renaming rules:
* [Rename Object config for `cache` plugin](.API.md#renameobject)
* [Rename Function config for `cache` plugin](.API.md#renamefunction)

## Circular Dependencies and metadata

We recommend always build metadata from scratch. But if you really have an intensive metadata plugin. You can force updates of file's metadata (not global metadata):
* [Props List config for `cache` plugin](.API.md#propslist)

## Trouble with `metalsmith-collections`?

Check https://github.com/segmentio/metalsmith-collections/issues/27

# API

Check our [API documentation](./API.md).

# Inspiration
After we had very long metalsmith builds during development, it was time to seek for change.
We have found this inspiring blog post http://www.mograblog.com/2016/11/speed-up-metalsmith.html.
Though it was far from complete, not mentioning circular references, dependencies, metadata and more very specific stuff, we decided to take the next step.
