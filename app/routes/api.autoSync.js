import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import urls from "../config/urls";

// Pick the Admin API version you want for the REST calls:
const SHOPIFY_API_VERSION = "2025-01";

// Helper function to extract numeric ID from Shopify's global ID
const extractNumericId = (gid) => gid.split("/").pop();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    console.log("Starting auto-sync process...");

    // Get access key from metafields
    const metafieldResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "access_key") {
            value
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    const accessKey = metafieldData.data.shop.metafield?.value;

    if (!accessKey) {
      console.log("Auto-sync: No access key found, skipping");
      return json(
        { success: false, error: "No access key found" },
        { status: 400 },
      );
    }

    // ---------------------
    // 1) Basic shop info
    // ---------------------
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
          name
          email
          primaryDomain { url }
          currencyCode
          timezoneAbbreviation
        }
      }
    `);
    const shopData = await shopResponse.json();
    if (!shopData?.data?.shop) {
      throw new Error("Shop data is missing or permissions are not granted.");
    }

    // ---------------------
    // 2) Products (GraphQL for IDs, relationships)
    // ---------------------
    const productsResponse = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              tags
              publishedAt
              status
              description
              descriptionHtml
              seo {
                title
                description
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              totalInventory
              tracksInventory
              hasOnlyDefaultVariant
              hasOutOfStockVariants
              createdAt
              updatedAt
              images(first: 10) {
                edges {
                  node {
                    id
                    originalSrc
                    altText
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                    compareAtPrice
                    inventoryPolicy
                    inventoryItem {
                      tracked
                    }
                  }
                }
              }
              collections(first: 10) {
                edges {
                  node {
                    id
                    title
                    handle
                    description
                    image {
                      url
                      altText
                    }
                    ruleSet {
                      rules {
                        column
                        condition
                        relation
                      }
                    }
                    sortOrder
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `);
    const productsData = await productsResponse.json();

    // Check for GraphQL errors
    if (productsData.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(productsData.errors)}`);
    }

    // Check if we have valid data
    if (!productsData?.data?.products?.edges) {
      throw new Error("Invalid products data structure received from GraphQL");
    }

    // Process products data directly from GraphQL
    const mergedProducts = productsData.data.products.edges
      .map(({ node }) => {
        if (!node) {
          console.warn("Skipping invalid product node");
          return null;
        }

        return {
          shopifyId: parseInt(extractNumericId(node.id)),
          title: node.title || "",
          handle: node.handle || "",
          vendor: node.vendor || "",
          productType: node.productType || "",
          description: node.description || "",
          bodyHtml: node.descriptionHtml || "",
          tags: node.tags || [],
          publishedAt: node.publishedAt,
          status: node.status || "DRAFT",
          seo: node.seo || { title: "", description: "" },
          priceRange: node.priceRangeV2 || {
            minVariantPrice: { amount: "0", currencyCode: "USD" },
            maxVariantPrice: { amount: "0", currencyCode: "USD" },
          },
          totalInventory: node.totalInventory || 0,
          tracksInventory: node.tracksInventory || false,
          hasOnlyDefaultVariant: node.hasOnlyDefaultVariant || false,
          hasOutOfStockVariants: node.hasOutOfStockVariants || false,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          images: (node.images?.edges || []).map(({ node: img }) => ({
            shopifyId: parseInt(extractNumericId(img.id)),
            url: img.originalSrc || "",
            altText: img.altText || "",
          })),
          variants: (node.variants?.edges || []).map(({ node: v }) => ({
            shopifyId: parseInt(extractNumericId(v.id)),
            title: v.title || "",
            price: parseFloat(v.price || "0"),
            sku: v.sku || "",
            inventory: v.inventoryQuantity || 0,
            compareAtPrice: v.compareAtPrice
              ? parseFloat(v.compareAtPrice)
              : null,
            inventoryPolicy: v.inventoryPolicy || "DENY",
            inventoryTracking: v.inventoryItem?.tracked || false,
          })),
          collections: (node.collections?.edges || []).map(
            ({ node: coll }) => ({
              shopifyId: parseInt(extractNumericId(coll.id)),
              title: coll.title || "",
              handle: coll.handle || "",
              description: coll.description || "",
              image: coll.image
                ? {
                    url: coll.image.url || "",
                    altText: coll.image.altText || "",
                  }
                : null,
              ruleSet: coll.ruleSet
                ? {
                    rules: (coll.ruleSet.rules || []).map((rule) => ({
                      column: rule.column || "",
                      condition: rule.condition || "",
                      relation: rule.relation || "",
                    })),
                  }
                : null,
              sortOrder: coll.sortOrder || "BEST_SELLING",
              updatedAt: coll.updatedAt,
            }),
          ),
        };
      })
      .filter(Boolean); // Remove any null entries

    // ---------------------
    // 3) Pages (GraphQL for IDs)
    // ---------------------
    const pagesResponse = await admin.graphql(`
      query {
        pages(first: 50) {
          edges {
            node {
              id
              title
              handle
              body
              bodySummary
              createdAt
              updatedAt
              publishedAt
              isPublished
              templateSuffix
              metafields(first: 10) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `);
    const pagesData = await pagesResponse.json();

    // Check for GraphQL errors
    if (pagesData.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(pagesData.errors)}`);
    }

    // Check if we have valid data
    if (!pagesData?.data?.pages?.edges) {
      throw new Error("Invalid pages data structure received from GraphQL");
    }

    // Fetch shop policies
    const policiesResponse = await admin.graphql(`
      query {
        shop {
          shopPolicies {
            id
            title
            body
            url
            type
            createdAt
            updatedAt
          }
        }
      }
    `);
    const policiesData = await policiesResponse.json();

    // For untruncated HTML, fetch each page with REST
    const mergedPages = await Promise.all(
      pagesData.data.pages.edges.map(async ({ node }) => {
        if (!node) {
          console.warn("Skipping invalid page node");
          return null;
        }

        const numericId = extractNumericId(node.id);

        // GET /pages/{pageId}.json
        const pageRes = await fetch(
          `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/pages/${numericId}.json`,
          {
            method: "GET",
            headers: {
              "X-Shopify-Access-Token": session.accessToken,
              "Content-Type": "application/json",
            },
          },
        );
        if (!pageRes.ok) {
          throw new Error(
            `REST call failed: ${pageRes.status} ${pageRes.statusText}`,
          );
        }
        const fullPage = await pageRes.json();

        return {
          shopifyId: parseInt(numericId),
          title: fullPage.page.title || "",
          handle: fullPage.page.handle || "",
          content: fullPage.page.body_html || "",
          bodySummary: node.bodySummary || "",
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          publishedAt: node.publishedAt,
          isPublished: node.isPublished || false,
          templateSuffix: node.templateSuffix || "",
          metafields: (node.metafields?.edges || []).map(({ node: meta }) => ({
            id: meta.id || "",
            namespace: meta.namespace || "",
            key: meta.key || "",
            value: meta.value || "",
          })),
        };
      }),
    ).then((pages) => pages.filter(Boolean)); // Remove any null entries

    // Process policies as pages
    const policyPages = [];

    // Process all policies from the array
    if (
      policiesData.data.shop.shopPolicies &&
      Array.isArray(policiesData.data.shop.shopPolicies)
    ) {
      policiesData.data.shop.shopPolicies.forEach((policy) => {
        if (policy && policy.body) {
          policyPages.push({
            shopifyId: 0, // Policies don't have shopify IDs in the same way
            title: policy.title || `${policy.type} Policy`,
            handle:
              policy.handle || policy.type.toLowerCase().replace(/\s+/g, "-"),
            content: policy.body || "",
            bodySummary: policy.body
              ? policy.body.substring(0, 200) + "..."
              : "",
            createdAt: policy.createdAt || new Date().toISOString(),
            updatedAt: policy.updatedAt || new Date().toISOString(),
            publishedAt: policy.createdAt || new Date().toISOString(),
            isPublished: true,
            templateSuffix: "",
            metafields: [],
            isPolicy: true,
            policyType: policy.type,
            policyUrl: policy.url || "",
          });
        }
      });
    }

    // Combine regular pages with policy pages
    const allPages = [...mergedPages, ...policyPages];

    // ---------------------
    // 4) Blogs + Articles (GraphQL for IDs)
    // ---------------------
    const blogsResponse = await admin.graphql(`
      {
        blogs(first: 10) {
          edges {
            node {
              id
              title
              handle
              articlesCount {
                count
                precision
              }
              commentPolicy
              createdAt
              updatedAt
              feed {
                location
                path
              }
              metafields(first: 10) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                  }
                }
              }
              tags
              templateSuffix
              articles(first: 20) {
                edges {
                  node {
                    id
                    title
                    handle
                    body
                    author {
                      name
                    }
                    image {
                      url
                      altText
                    }
                    isPublished
                    publishedAt
                    summary
                    tags
                    templateSuffix
                    createdAt
                    updatedAt
                    metafields(first: 10) {
                      edges {
                        node {
                          id
                          namespace
                          key
                          value
                        }
                      }
                    }
                    comments(first: 10) {
                      edges {
                        node {
                          id
                          author {
                            name
                          }
                          body
                          createdAt
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `);
    const blogsData = await blogsResponse.json();

    // Check for GraphQL errors
    if (blogsData.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(blogsData.errors)}`);
    }

    // Check if we have valid data
    if (!blogsData?.data?.blogs?.edges) {
      throw new Error("Invalid blogs data structure received from GraphQL");
    }

    // For untruncated articles
    const mergedBlogs = await Promise.all(
      blogsData.data.blogs.edges.map(async ({ node: blog }) => {
        if (!blog) {
          console.warn("Skipping invalid blog node");
          return null;
        }

        const blogNumericId = extractNumericId(blog.id);

        const mergedArticles = await Promise.all(
          (blog.articles?.edges || []).map(async ({ node: article }) => {
            if (!article) {
              console.warn("Skipping invalid article node");
              return null;
            }

            const articleNumericId = extractNumericId(article.id);

            // GET /blogs/{blogId}/articles/{articleId}.json
            const articleRes = await fetch(
              `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/blogs/${blogNumericId}/articles/${articleNumericId}.json`,
              {
                method: "GET",
                headers: {
                  "X-Shopify-Access-Token": session.accessToken,
                  "Content-Type": "application/json",
                },
              },
            );
            if (!articleRes.ok) {
              throw new Error(
                `REST call failed: ${articleRes.status} ${articleRes.statusText}`,
              );
            }
            const fullArticle = await articleRes.json();

            return {
              shopifyId: parseInt(articleNumericId),
              title: fullArticle.article.title || "",
              handle: fullArticle.article.handle || "",
              content: fullArticle.article.body_html || "",
              author: fullArticle.article.author || "",
              image: fullArticle.article.image?.src || null,
              isPublished: article.isPublished || false,
              publishedAt: article.publishedAt,
              summary: fullArticle.article.summary || "",
              tags: fullArticle.article.tags || [],
              templateSuffix: fullArticle.article.templateSuffix || "",
              createdAt: fullArticle.article.createdAt,
              updatedAt: fullArticle.article.updatedAt,
              metafields: (fullArticle.article.metafields?.edges || []).map(
                ({ node: meta }) => ({
                  id: meta.id || "",
                  namespace: meta.namespace || "",
                  key: meta.key || "",
                  value: meta.value || "",
                }),
              ),
              comments: (fullArticle.article.comments?.edges || []).map(
                ({ node: comment }) => ({
                  id: comment.id || "",
                  author: comment.author?.name || "",
                  content: comment.body || "",
                  createdAt: comment.createdAt,
                }),
              ),
            };
          }),
        ).then((articles) => articles.filter(Boolean)); // Remove any null entries

        return {
          shopifyId: parseInt(blogNumericId),
          title: blog.title || "",
          handle: blog.handle || "",
          articlesCount: blog.articlesCount?.count || 0,
          commentPolicy: blog.commentPolicy || "MODERATE",
          createdAt: blog.createdAt,
          updatedAt: blog.updatedAt,
          feed: blog.feed
            ? {
                location: blog.feed.location || "",
                path: blog.feed.path || "",
              }
            : null,
          metafields: (blog.metafields?.edges || []).map(({ node: meta }) => ({
            id: meta.id || "",
            namespace: meta.namespace || "",
            key: meta.key || "",
            value: meta.value || "",
          })),
          tags: blog.tags || [],
          templateSuffix: blog.templateSuffix || "",
          posts: mergedArticles,
        };
      }),
    ).then((blogs) => blogs.filter(Boolean)); // Remove any null entries

    // ---------------------
    // 5) Collections (GraphQL only)
    // ---------------------
    const collectionsResponse = await admin.graphql(`
      {
        collections(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              image {
                url
                altText
              }
              products(first: 50) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
              ruleSet {
                rules {
                  column
                  condition
                  relation
                }
              }
              sortOrder
              updatedAt
            }
          }
        }
      }
    `);
    const collectionsData = await collectionsResponse.json();

    const formattedCollections = collectionsData.data.collections.edges.map(
      ({ node }) => ({
        shopifyId: parseInt(extractNumericId(node.id)),
        title: node.title,
        handle: node.handle,
        description: node.description,
        image: node.image
          ? {
              url: node.image.url,
              altText: node.image.altText,
            }
          : null,
        products: node.products.edges.map(({ node: product }) => ({
          shopifyId: parseInt(extractNumericId(product.id)),
          title: product.title,
          handle: product.handle,
        })),
        ruleSet: node.ruleSet
          ? {
              rules: node.ruleSet.rules.map((rule) => ({
                column: rule.column,
                condition: rule.condition,
                relation: rule.relation,
              })),
            }
          : null,
        sortOrder: node.sortOrder,
        updatedAt: node.updatedAt,
      }),
    );

    // ---------------------
    // 6) Discounts (GraphQL only)
    // ---------------------
    const discountsResponse = await admin.graphql(`
      {
        codeDiscountNodes(first: 50) {
          edges {
            node {
              id
              codeDiscount {
                __typename
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                }
                ... on DiscountCodeBxgy {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  customerBuys {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                  customerGets {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                  }
                }
                ... on DiscountCodeFreeShipping {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  destinationSelection {
                    ... on DiscountCountryAll {
                      allCountries
                    }
                  }
                }
              }
            }
          }
        }
        automaticDiscountNodes(first: 50) {
          edges {
            node {
              id
              automaticDiscount {
                __typename
                ... on DiscountAutomaticBasic {
                  title
                  startsAt
                  endsAt
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
                ... on DiscountAutomaticBxgy {
                  title
                  startsAt
                  endsAt
                  status
                  customerBuys {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                  customerGets {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    const discountsData = await discountsResponse.json();

    const codeDiscounts = discountsData.data.codeDiscountNodes.edges.map(
      ({ node }) => {
        const d = node.codeDiscount;
        return {
          shopifyId: parseInt(extractNumericId(node.id)),
          title: d.title,
          code: d.codes?.edges[0]?.node?.code,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          status: d.status,
          type: d.__typename,
          value: d.customerGets?.value?.percentage
            ? `${d.customerGets.value.percentage}%`
            : d.customerGets?.value?.amount?.amount
              ? `${d.customerGets.value.amount.amount} ${d.customerGets.value.amount.currencyCode}`
              : "Free Shipping",
          appliesTo: d.customerGets?.items?.allItems
            ? "All Items"
            : "Specific Items",
        };
      },
    );

    const automaticDiscounts =
      discountsData.data.automaticDiscountNodes.edges.map(({ node }) => {
        const d = node.automaticDiscount;
        return {
          shopifyId: parseInt(extractNumericId(node.id)),
          title: d.title,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          status: d.status,
          type: d.__typename,
          value: d.customerGets?.value?.percentage
            ? `${d.customerGets.value.percentage}%`
            : d.customerGets?.value?.amount?.amount
              ? `${d.customerGets.value.amount.amount} ${d.customerGets.value.amount.currencyCode}`
              : null,
          appliesTo: d.customerGets?.items?.allItems
            ? "All Items"
            : "Specific Items",
        };
      });

    // ---------------------
    // Combine final data
    // ---------------------
    const formattedData = {
      shop: shopData.data.shop,
      products: mergedProducts,
      collections: formattedCollections,
      pages: allPages,
      blogs: mergedBlogs,
      discounts: {
        codeDiscounts,
        automaticDiscounts,
      },
    };

    // ---------------------
    // Send data to auto-sync endpoint (try localhost first, then fallback to production)
    // ---------------------
    const syncUrls = [
      `${urls.apiBaseUrl}/api/shopify/autoSync`, // localhost:3000
      `${urls.voiceroApi}/api/shopify/autoSync`, // www.voicero.ai
    ];

    let autoSyncResult = null;
    let lastError = null;

    for (let i = 0; i < syncUrls.length; i++) {
      const syncUrl = syncUrls[i];
      const isLocalhost = syncUrl.includes('localhost');
      
      try {
        console.log(`Auto-sync: Attempting to send data to ${isLocalhost ? 'localhost' : 'production'}...`);
        
        const autoSyncResponse = await fetch(syncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({
            autoSync: true,
            data: formattedData,
          }),
        });

        if (!autoSyncResponse.ok) {
          const errorData = await autoSyncResponse.json();
          throw new Error(
            `Auto-sync failed! status: ${autoSyncResponse.status}, details: ${
              errorData.error || "unknown error"
            }`,
          );
        }

        autoSyncResult = await autoSyncResponse.json();
        console.log(`Auto-sync completed successfully via ${isLocalhost ? 'localhost' : 'production'}:`, autoSyncResult);
        break; // Exit loop on success
      } catch (error) {
        console.error(`Auto-sync error with ${isLocalhost ? 'localhost' : 'production'}:`, error.message);
        lastError = error;
        
        // If this is not the last URL, continue to next
        if (i < syncUrls.length - 1) {
          console.log(`Auto-sync: Trying next endpoint...`);
          continue;
        }
      }
    }

    // If all attempts failed, throw the last error
    if (!autoSyncResult) {
      throw lastError || new Error("All auto-sync endpoints failed");
    }

    return json({
      success: true,
      message: "Auto-sync completed successfully",
      result: autoSyncResult,
    });
  } catch (error) {
    console.error("Detailed auto-sync error:", {
      message: error.message,
      stack: error.stack,
    });
    return json(
      {
        success: false,
        error: "Auto-sync failed",
        details: error.message,
      },
      { status: 500 },
    );
  }
};
