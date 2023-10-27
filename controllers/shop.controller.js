'use strict';
import { pool } from "../config/db.js";
import { checkIsManagerUrl } from "../utils.js/function.js";
import { getMultipleQueryByWhen, getSelectQuery } from "../utils.js/query-util.js";
import { checkDns, checkLevel, findChildIds, homeItemsSetting, homeItemsWithCategoriesSetting, isItemBrandIdSameDnsId, lowLevelException, makeObjByList, makeTree, makeUserToken, response } from "../utils.js/util.js";
import 'dotenv/config';
import when from 'when';

const shopCtrl = {
    setting: async (req, res, next) => {
        try {
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { } = req.query;
            //products
            let product_columns = [
                `products.*`,
                `product_categories.name AS category_name`
            ]
            let product_sql = `SELECT ${product_columns.join()} FROM products `;
            product_sql += ` LEFT JOIN product_categories ON products.category_id=product_categories.id `;
            product_sql += ` WHERE products.brand_id=${decode_dns?.id} `;
            product_sql += ` AND products.is_delete=0 `
            //product categories
            let product_category_columns = [
                `product_categories.*`,
            ]
            let product_category_sql = `SELECT ${product_category_columns.join()} FROM product_categories `;
            product_category_sql += ` WHERE product_categories.brand_id=${decode_dns?.id} `;

            //when
            let sql_list = [
                { table: 'products', sql: product_sql },
                { table: 'product_categories', sql: product_category_sql },
            ]
            let data = await getMultipleQueryByWhen(sql_list);
            data['product_categories'] = await makeTree(data?.product_categories);
            return response(req, res, 100, "success", data);
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    main: async (req, res, next) => {
        try {
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            let dns_data = await pool.query(`SELECT shop_obj FROM brands WHERE id=${decode_dns?.id}`);
            dns_data = dns_data?.result[0];
            dns_data['shop_obj'] = JSON.parse(dns_data?.shop_obj ?? '{}');
            let content_list = dns_data['shop_obj'];
            let sql_list = [];
            // sql_list.push({
            //     table:'post',
            //     sql: `SELECT * FROM posts `,
            // })
            sql_list.push({
                table: 'product',
                sql: `SELECT * FROM products WHERE brand_id=${decode_dns?.id} `,
            })
            let sql_data = await getMultipleQueryByWhen(sql_list);
            let posts = sql_data['post'] ?? [];
            let products = sql_data['product'] ?? [];
            let item_id_list = [0];
            item_id_list = [...item_id_list, ...products.map(item => { return item.id })];
           

            for (var i = 0; i < content_list.length; i++) {
                if (content_list[i]?.type == 'items' && products.length > 0) {
                    content_list[i] = homeItemsSetting(content_list[i], products);
                }
                if (content_list[i]?.type == 'items-with-categories' && products.length > 0) {
                    content_list[i] = homeItemsWithCategoriesSetting(content_list[i], products);
                }
                if (content_list[i]?.type == 'post') {
                    content_list[i] = {
                        ...content_list[i],
                        posts: post_obj,
                        categories: themePostCategoryList,
                    };
                }
                if (content_list[i]?.type == 'item-reviews') {
                    let review_list = [...test_product_reviews];
                    for (var j = 0; j < review_list.length; j++) {
                        review_list[j].product = _.find(products, { id: review_list[j]?.product_id });
                    }
                    content_list[i] = {
                        ...content_list[i],
                        title: '상품후기',
                        sub_title: 'REVIEW',
                        list: [...review_list],
                    }
                }
            }
            return response(req, res, 100, "success", content_list);
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    items: async (req, res, next) => { //상품 리스트출력
        try {
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { category_id } = req.query;

            let columns = [
                `products.*`,
                `product_categories.name AS category_name`
            ]
            let category_sql = `SELECT id, parent_id FROM product_categories `;
            category_sql += ` WHERE product_categories.brand_id=${decode_dns?.id} `;
            let category_list = await pool.query(category_sql);
            category_list = category_list?.result;
            let category_ids = findChildIds(category_list, category_id)
            category_ids.unshift(parseInt(category_id))

            let sql = `SELECT ${process.env.SELECT_COLUMN_SECRET} FROM products `;
            sql += ` LEFT JOIN product_categories ON products.category_id=product_categories.id `;
            sql += ` WHERE products.brand_id=${decode_dns?.id} `;

            if (category_id) {
                sql += ` AND products.category_id IN (${category_ids.join()}) `
            } 
            let data = await getSelectQuery(sql, columns, req.query);
            
            return response(req, res, 100, "success", data);
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    item: async (req, res, next) => { //상품 단일 출력
        try {
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { id } = req.params;
            let data = await pool.query(`SELECT * FROM products WHERE id=${id}`)
            data = data?.result[0];
            data['product_sub_imgs'] = JSON.parse(data?.product_sub_imgs ?? "[]");
         
            let product_groups = await pool.query(`SELECT * FROM product_options WHERE product_id=${id} AND is_delete=0 ORDER BY id ASC `);
            product_groups = product_groups?.result;
            let groups = [];
            let option_obj = makeObjByList('parent_id', product_groups);
            for (var i = 0; i < product_groups.length; i++) {
                if (product_groups[i].parent_id < 0) {
                    option_obj[product_groups[i]?.id] = (option_obj[product_groups[i]?.id] ?? []).map(option => {
                        return {
                            ...option,
                            option_name: option?.name,
                            option_price: option?.price,
                        }
                    })
                    groups.push({
                        ...product_groups[i],
                        group_name: product_groups[i]?.name,
                        group_price: product_groups[i]?.price,
                        options: option_obj[product_groups[i]?.id]
                    })
                }
            }
            data['groups'] = groups;
            let product_characters = await pool.query(`SELECT * FROM product_characters WHERE product_id=${id} AND is_delete=0 ORDER BY id ASC `);
            product_characters = product_characters?.result;
            for (var i = 0; i < product_characters.length; i++) {
                product_characters[i] = {
                    ...product_characters[i],
                    character_key: product_characters[i]?.key_name,
                    character_value: product_characters[i]?.value,
                }
            }
            data['characters'] = product_characters;
            if (!isItemBrandIdSameDnsId(decode_dns, data)) {
                return lowLevelException(req, res);
            }
            return response(req, res, 100, "success", data)
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },

}

export default shopCtrl;