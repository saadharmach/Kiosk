\echo '=== 1. Egg Royal option links ==='
select ao."restaurantId", ao."optionGroupId", og.name as group_name,
       ao."requiredChoices", ao."isFreeOption", ao."sortOrder"
from tpapi_article_options ao
left join tpapi_option_groups og
  on og."untillId" = ao."optionGroupId" and og."restaurantId" = ao."restaurantId"
where ao."articleId" = 45000254454
order by ao."restaurantId", ao."sortOrder";

\echo '=== 2. how many articles use composed options ==='
select count(distinct "articleId") as articles_with_composed,
       count(*) as composed_links
from tpapi_article_options
where "requiredChoices" is not null;

\echo '=== 3. which articles they are ==='
select ao."articleId", a.name, count(*) as composed_groups
from tpapi_article_options ao
join tpapi_articles a
  on a."untillId" = ao."articleId" and a."restaurantId" = ao."restaurantId"
where ao."requiredChoices" is not null
group by ao."articleId", a.name
order by a.name
limit 25;

\echo '=== 4. menu articles: do they have prices? ==='
select a."untillId", a.name, a."isManualPrice",
       (select count(*) from tpapi_article_prices p
         where p."articleId" = a."untillId" and p."restaurantId" = a."restaurantId") as price_rows
from tpapi_articles a
where a."isMenu" = true
order by price_rows desc, a.name
limit 30;

\echo '=== 5. manual-price articles ==='
select a."untillId", a.name,
       (select count(*) from tpapi_article_prices p
         where p."articleId" = a."untillId" and p."restaurantId" = a."restaurantId") as price_rows
from tpapi_articles a
where a."isManualPrice" = true
order by a.name
limit 30;