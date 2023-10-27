'use strict';
import { pool } from "../config/db.js";
import { checkIsManagerUrl } from "../utils.js/function.js";
import { deleteQuery, getSelectQuery, insertQuery, selectQuerySimple, updateQuery } from "../utils.js/query-util.js";
import { checkDns, checkLevel, createHashedPassword, isItemBrandIdSameDnsId, lowLevelException, makeObjByList, makeUserChildrenList, makeTree, response, settingFiles } from "../utils.js/util.js";
import 'dotenv/config';

const table_name = 'users';

const userCtrl = {
    list: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { page = 1, page_size = 100000, is_asc = false, order = 'id', s_dt, e_dt } = req.query;

            let columns = [
                `${table_name}.*`,
                'brands.name AS brand_name',
                'parent_users.user_name AS parent_user_name',
            ]
            let sql = `SELECT ${columns.join()} FROM ${table_name} `;
            sql += `LEFT JOIN brands ON ${table_name}.brand_id=brands.id `;
            sql += `LEFT JOIN users AS parent_users ON ${table_name}.parent_id=parent_users.id `;
            sql += ` WHERE ${table_name}.brand_id=${decode_dns?.id} `
            sql += ` AND ${table_name}.level IN (10, 40) `; // sales-man 불러올때
            sql += ` AND ${table_name}.is_delete=0 `;

            let user_list = await pool.query(sql);
            user_list = user_list?.result
            if(decode_user?.level<50){
                user_list = makeUserChildrenList(user_list, decode_user);
            }
            user_list = user_list.sort(function (a, b) {
                return a[order] - b[order];
            });
            if (s_dt) {
                user_list = user_list.filter((item) => item?.created_at >= `${s_dt} 00:00:00`)
            }
            if (e_dt) {
                user_list = user_list.filter((item) => item?.created_at <= `${e_dt} 23:59:59`)
            }
            let user_length = user_list.length;
            return response(req, res, 100, "success", {
                page,
                page_size,
                total: user_length,
                content: user_list
            });
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    organizationalChart: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);

            let user_list = await pool.query(`SELECT * FROM ${table_name} WHERE ${table_name}.brand_id=${decode_dns?.id} AND ${table_name}.is_delete=0 `);
            let user_tree = makeTree(user_list?.result, decode_user);
            return response(req, res, 100, "success", user_tree);
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    get: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { id } = req.params;
            let data = await pool.query(`SELECT * FROM ${table_name} WHERE id=${id}`)
            data = data?.result[0];
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
    remove: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { id } = req.params;
            let result = await deleteQuery(`${table_name}`, {
                id
            })
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    create: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            let {
                brand_id, user_name, user_pw, name, nickname, parent_user_name, level, phone_num, profile_img, note,
            } = req.body;
            let is_exist_user = await pool.query(`SELECT * FROM ${table_name} WHERE user_name=? AND brand_id=${brand_id}`, [user_name]);
            if (is_exist_user?.result.length > 0) {
                return response(req, res, -100, "유저아이디가 이미 존재합니다.", false)
            }
            let parent_id = await pool.query(`SELECT * FROM ${table_name} WHERE user_name=? AND brand_id=${brand_id} `, [parent_user_name]);
            if (level >= 10) {//영업자 일때
                if (parent_id?.result.length > 0) {
                    parent_id = parent_id?.result[0]?.id;
                } else {
                    return response(req, res, -100, "상위영업자가 존재하지 않습니다.", false)
                }
            }
            let pw_data = await createHashedPassword(user_pw);
            user_pw = pw_data.hashedPassword;
            let user_salt = pw_data.salt;
            let files = settingFiles(req.files);
            let obj = {
                brand_id, user_name, user_pw, user_salt, name, nickname, parent_id, level, phone_num, profile_img, note
            };
            obj = { ...obj, ...files };
            let result = await insertQuery(`${table_name}`, obj);

            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    update: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const {
                brand_id, user_name, name, nickname, level, phone_num, profile_img, note, id
            } = req.body;
            let files = settingFiles(req.files);
            let obj = {
                brand_id, user_name, name, nickname, level, phone_num, profile_img, note
            };
            obj = { ...obj, ...files };
            let result = await updateQuery(`${table_name}`, obj, id);
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    changePassword: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { id } = req.params
            let { user_pw } = req.body;

            let user = await selectQuerySimple(table_name, id);
            user = user?.result[0];
            if(!user || decode_user?.level < user?.level){
                return response(req, res, -100, "잘못된 접근입니다.", false)
            }
            let pw_data = await createHashedPassword(user_pw);
            user_pw = pw_data.hashedPassword;
            let user_salt = pw_data.salt;
            let obj = {
                user_pw, user_salt
            }
            let result = await updateQuery(`${table_name}`, obj, id);
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
    changeStatus: async (req, res, next) => {
        try {
            let is_manager = await checkIsManagerUrl(req);
            const decode_user = checkLevel(req.cookies.token, 0);
            const decode_dns = checkDns(req.cookies.dns);
            const { id } = req.params
            let { status } = req.body;
            let user = await selectQuerySimple(table_name, id);
            console.log(status)
            user = user?.result[0];
            if(!user || decode_user?.level < user?.level){
                return response(req, res, -100, "잘못된 접근입니다.", false)
            }
            let obj = {
                status
            }
            let result = await updateQuery(`${table_name}`, obj, id);
            return response(req, res, 100, "success", {})
        } catch (err) {
            console.log(err)
            return response(req, res, -200, "서버 에러 발생", false)
        } finally {

        }
    },
}
export default userCtrl;
