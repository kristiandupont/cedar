// @ts-check

const {
  knexTypeFilter,
  generateMigrationCheck,
  generateKnexTablesModule,
} = require("kanel-knex");
const { makeGenerateSeeds } = require("kanel-seeder");
const {
  makeGenerateZodSchemas,
  defaultGetZodSchemaMetadata,
  defaultGetZodIdentifierMetadata,
  defaultZodTypeMap,
} = require("kanel-zod");
const {
  makePgTsGenerator,
  makeMarkdownGenerator,
  markAsGenerated,
} = require("kanel");

const defaultZodTypeMapExtensions = {
  "pg_catalog.tsrange": "z.custom<Range<Date>>(v => v)",
  "public.email": {
    name: "emailString",
    typeImports: [
      {
        name: "emailString",
        path: "narrow-types",
        isAbsolute: true,
        isDefault: false,
      },
    ],
  },
  "public.vector": "z.array(z.number())",
};

const defaultCustomTypeMap = {
  "public.email": {
    name: "EmailString",
    typeImports: [
      {
        name: "EmailString",
        path: "narrow-types",
        isAbsolute: true,
        isDefault: false,
        importAsType: true,
      },
    ],
  },
  "public.vector": "number[]",
};

const deletedRecordTables = ["deleted_record", "deleted_record_insert_dynamic"];

/**
 * @param {{
 *   connection: string | object,
 *   outputPath?: string,
 *   specificTypes: import("kanel").PreRenderHookV4,
 *   generateWorkspace: import("kanel").PreRenderHookV4,
 *   additionalZodTypes?: Record<string, unknown>,
 *   additionalCustomTypes?: Record<string, unknown>,
 *   markdownTarget?: { output: string, template: string },
 * }} options
 * @returns {import('kanel').Config}
 */
function makeCedarKanelConfig(options) {
  const {
    connection,
    outputPath = "./src/models",
    specificTypes,
    generateWorkspace,
    additionalZodTypes = {},
    additionalCustomTypes = {},
    markdownTarget = {
      output: `${outputPath}/public/README.md`,
      template: "./kanel/docs-src/README.md.hbs",
    },
  } = options;

  const generateZodSchemas = makeGenerateZodSchemas({
    getZodSchemaMetadata: defaultGetZodSchemaMetadata,
    getZodIdentifierMetadata: defaultGetZodIdentifierMetadata,
    zodTypeMap: {
      ...defaultZodTypeMap,
      ...defaultZodTypeMapExtensions,
      ...additionalZodTypes,
    },
    castToSchema: true,
  });

  const generateTestSeeds = makeGenerateSeeds({
    srcPath: "./seeds-src/test",
    dstPath: "./seeds/test",
  });

  const generateDevSeeds = makeGenerateSeeds({
    srcPath: "./seeds-src/dev",
    dstPath: "./seeds/dev",
  });

  return {
    connection,
    outputPath,
    resolveViews: true,
    preDeleteOutputFolder: true,
    typescriptConfig: { enumStyle: "literal-union" },

    filter: (t) => {
      if (!knexTypeFilter(t)) return false;
      return !deletedRecordTables.includes(t.name);
    },

    generators: [
      makePgTsGenerator({
        customTypeMap: { ...defaultCustomTypeMap, ...additionalCustomTypes },
        preRenderHooks: [
          generateMigrationCheck,
          generateKnexTablesModule,
          generateZodSchemas,
          specificTypes,
          generateWorkspace,
        ],
      }),
      makeMarkdownGenerator({
        targets: [markdownTarget],
      }),
      generateTestSeeds,
      generateDevSeeds,
    ],

    schemaNames: ["public"],
    postRenderHooks: [markAsGenerated],
  };
}

exports.makeCedarKanelConfig = makeCedarKanelConfig;
