/**
 * cron: 55 11,23 * * *
 */
const $ = new Env('API更新GitHub仓库');
const axios = require('axios')
const notify = $.isNode() ? require('./sendNotify') : '';
const path = require("path");
const fs = require("fs");
const filePath = './';//更新当前文件夹内文件
let loglevel = "log"
console.log("🔔当前log级别——", loglevel);
if (loglevel === "log") {
    console.info = () => { };
    console.debug = () => { };
} else if (loglevel === "info") {
    console.debug = () => { };
} else if (loglevel === "debug") {
    console.info = () => { };
}

let GT_TOKEN = "",
    message = '',
    user = 'greenwave1987',
    repo = 'jdtaxi',
    sha = '',
    file_list = [],
    file_sha_list = {},
    git_file_list=[],
    local_file_list=[],
    del_file_list=[],
    private=false;
if (process.env.GT_TOKEN_SJC) {
    GT_TOKEN = process.env.GT_TOKEN_SJC;
}
//以上内容与自用脚本不同，莫复制
!(async () => {
    /**
     * 遍历文件，获取含关键词的文件列表
     * 上传文件
     */
    //获取所有文件sha列表
    await get_folder_sha(user, repo)
    console.debug(file_sha_list)
    //检查本地文件是否更新
    await recursiveReadFile(filePath)

    console.log(`\n即将上传【${file_list.length}】个今日更新文件！\n`)
    for (let i = 0; i < file_list.length; i++) {
        console.log(`\n准备上传【${file_list[i]}】......\n`)
        content = readFile(file_list[i])
        //sha = await get_file_data(user, repo, file_list[i])
        sha = file_sha_list[file_list[i]] ? file_sha_list[file_list[i]] : ''
        await putgithub(content, user, repo, file_list[i], sha)
        await $.wait(2000)
    }
    //检查已删除文件，即本地无，仓库有的文件，删除仓库多余文件
    git_file_list = Object.keys(file_sha_list);
    del_file_list = git_file_list.filter(item => !local_file_list.includes(item));
    console.log(`\n即将删除【${del_file_list.length}】个今日更新文件！\n`)
    for (let i = 0; i < del_file_list.length; i++) {
        console.log(`\n准备备份【${del_file_list[i]}】......\n`)
        let file_data = await get_file_data(user, repo, del_file_list[i])
        if (file_data && file_data.content) {
            await putgithub(file_data.content, user, 'backups', del_file_list[i] + $.time('MM_dd') + '.bak', '')
            await $.wait(2000)
        }

        console.log(`\n准备删除【${del_file_list[i]}】......\n`)
        //sha = await get_file_data(user, repo, del_file_list[i])
        sha = file_sha_list[del_file_list[i]] ? file_sha_list[del_file_list[i]] : ''
        await delgithub(user, repo, del_file_list[i], sha)
        await $.wait(2000)

    }
    //推送消息
    if (message) {
        await showMsg()
    };
})()
    .catch((e) => {
        $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
    })
    .finally(() => {
        $.done();
    })

function recursiveReadFile(fileName) {
    //console.log('目录：', fileName);
    if (!fs.existsSync(fileName)) return;
    if (isFile(fileName)) {

        check(fileName);

    }
    if (isDirectory(fileName)) {
        if (fileName.match(/(?=pnpm|cache)/)) {
            console.log('该文件夹禁止上传：', fileName);
        } else {
            //console.log('  次目录：', fileName);
            var files = fs.readdirSync(fileName);
            files.forEach(function (val, key) {
                var temp = path.join(fileName, val);
                if (isDirectory(temp)) recursiveReadFile(temp);
                if (isFile(temp)) check(temp);
            });
        }

    }
}

async function check1(fileName) {
    console.log(fileName, '  加入缓存队列.....');
    file_list.push(fileName)

}

function isDirectory(fileName) {
    if (fs.existsSync(fileName)) return fs.statSync(fileName).isDirectory();
}

function isFile(fileName) {
    if (fs.existsSync(fileName)) return fs.statSync(fileName).isFile();
}

function readFile(fileName) {
    if (fs.existsSync(fileName)) return fs.readFileSync(fileName, "utf-8");
}

//定义检查版本函数
function check(fileName) {
    console.log(`\n开始检查-->${fileName}`)
    local_file_list.push(fileName)
    var stat = fs.statSync(fileName);
    console.log('💤最后编辑时间：', $.time("MM_dd HH:mm:ss", stat.mtimeMs))
    //const zerotime = parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000 - (24 * 60 * 60 * 1000)
    var zerotime = new Date(new Date().toLocaleDateString()).getTime(); // 当天0点
    console.log(zerotime)
    console.log(stat.mtimeMs)
    if (!Math.trunc(zerotime) < Math.trunc(stat.mtimeMs)) {
        if (fileName.match(/(?=other)/)) {
            console.log('✅脚本有更新！')
            file_list.push(fileName)
        } else {
            console.log('❌脚本包含敏感词，跳过！')
        }
    } else {
        console.log('❌脚本未更新！')
    }
}
// 新建仓库
async function creat_repo(repo) {
    let msg = '',
        body = {
            "name": repo,//"仓库名称",
            "description": "This is your first repo!",
            "homepage": "https://github.com",
            "private": private
        }
    for (let i = 0; i < 2; i++) {
        try {
            const { status, data } = await axios({
                method: 'post',
                url: `https://api.github.com/user/repos`,
                data: body,
                headers: {
                    'Authorization': 'token ' + GT_TOKEN,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });
            console.debug(status, data)
            if (status == 201 && data) {
                console.log('✅creat_repo 成功！！')
                break
            } else {
                console.log('❌creat_repo 失败！！', status, data)
            }
        } catch (e) {
            console.log("❌creat_repo:", e.message)
            msg = `❌creat_repo 错误！！\n`
            await $.wait(4000)
        }
        await $.wait(2000)
    }
    message += msg
}
// 获取github单文件sha
async function get_file_data(user, repo, file_name) {
    let file_data = '', msg = ''
    for (let i = 0; i < 2; i++) {
        try {
            const { status, data } = await axios({
                method: 'get',
                url: `https://api.github.com/repos/${user}/${repo}/contents/${file_name}`,
                headers: {
                    'Authorization': 'token ' + GT_TOKEN,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });
            console.debug(status, data)
            if (status == 200 && data) {
                file_data = data

                console.log('✅get_file_data 成功！！')

                break
            } else if (status == 404) {
                console.log('❌仓库没有此文件！！', status)
                break
            } else {
                console.log('❌get_file_data 失败！！', status, data)
            }
        } catch (e) {
            console.log("❌get_file_data:", e.message)
           
            await $.wait(4000)
        }
        await $.wait(2000)
    }
    message += msg
    return file_data
}
// 获取github所有文件sha
async function get_folder_sha(user, repo, folder_name = '') {
    let msg = ''
    for (let i = 0; i < 2; i++) {
        try {
            const { status, data } = await axios({
                method: 'get',
                url: `https://api.github.com/repos/${user}/${repo}/git/trees/main:${folder_name}`,

                headers: {
                    'Authorization': 'token ' + GT_TOKEN,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });
            console.debug(status, data)
            if (status == 200 && data) {
                let file_tree = data.tree
                for (let j = 0; j < file_tree.length; j++) {
                    if (file_tree[j].type === "tree") {
                        await get_folder_sha(user, repo, file_tree[j].path)
                    } else if (file_tree[j].type === "blob") {
                        let key = folder_name ? (folder_name + '/' + file_tree[j].path) : file_tree[j].path
                        file_sha_list[key] = file_tree[j].sha
                    }
                }

                console.log(`✅get_folder【${repo}/${folder_name}】sha 成功！！`)
                break
            } else if (status == 404) {
                console.log('❌仓库没有此文件！！', status)
                break
            } else {
                console.log('❌get_folder_sha 失败！！', status, data)
            }
        } catch (e) {
            console.log("❌get_folder_sha:", e.message)
            
            await $.wait(4000)
        }
        await $.wait(2000)
    }
    message += msg
}
// 设置github
async function putgithub(content, user, repo, file_name, sha) {
    let datatemp = '', msg = ''
    if ("object" == typeof content) {
        content = JSON.stringify(content)
    }
    content = Buffer.from(content, 'utf-8').toString('base64')
    console.debug(`content-${content}`)
    let body = {
        "message": $.time("MM_dd HH:mm:ss"),//"提交说明",
        "content": content // 输入编码为utf8,输出为base64,//"base64编码的文件内容"
    }
    if (sha) {
        console.log(`更新-${file_name}`)
        body["sha"] = sha;//"文件的blob sha"
    } else {
        console.log(`新增-${file_name}`)
    }
    for (let i = 0; i < 2; i++) {
        try {
            const { status, data } = await axios({
                method: 'put',
                url: `https://api.github.com/repos/${user}/${repo}/contents/${file_name}`,
                data: body,
                headers: {
                    'Authorization': 'token ' + GT_TOKEN,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });
            console.debug(status, data)
            if (status == 200 && data) {
                datatemp = data
                console.log(`✅更新【${file_name}】成功！！`)
                break
            } else if (status == 201 && data) {
                console.log(`✅创建【${file_name}】成功！！`)

                break
            } else {
                console.log('❌putgithub 失败！！', status, data)
            }
        } catch (e) {
            console.log("❌putgithub:", e.message)

            await creat_repo(repo)
            await $.wait(4000)
        }
        await $.wait(2000)
    }
    message += msg
    return datatemp
}

// 设置github-删除文件
async function delgithub(user, repo, file_name, sha) {
    let datatemp = '', msg = ''

    let body = {
        "message": $.time("MM_dd HH:mm:ss"),//"提交说明",
    }
    if (sha) {
        console.log(`删除-${file_name}`)
        body["sha"] = sha;//"文件的blob sha"
    } else {
        console.log(`新增-${file_name}`)
    }
    for (let i = 0; i < 2; i++) {
        try {
            const { status, data } = await axios({
                method: 'DELETE',
                url: `https://api.github.com/repos/${user}/${repo}/contents/${file_name}`,
                data: body,
                headers: {
                    'Authorization': 'token ' + GT_TOKEN,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });
            console.debug(status, data)
            if (status == 200 && data) {
                datatemp = data
                console.log(`✅删除【${file_name}】成功！！`)
                break
            } else if (status == 201 && data) {
                console.log(`✅创建【${file_name}】成功！！`)

                break
            } else {
                console.log('❌delgithub 失败！！', status, data)
            }
        } catch (e) {
            console.log("❌delgithub:", e.message)

            await $.wait(4000)
        }
        await $.wait(2000)
    }
    message += msg
    return datatemp
}

//通知格式
async function showMsg() {
    if ($.isNode()) {
        $.msg($.name, '', `${message}`);
        await notify.sendNotify(`${$.name} `, `\n${message}`);
    }
}
function Env(t, e) { "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0); class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, r) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, h] = i.split("@"), n = { url: `http://${h}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(n, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), h = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(h); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) })) } post(t, e = (() => { })) { if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.post(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) }); else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t)); else if (this.isNode()) { this.initGotEnv(t); const { url: s, ...i } = t; this.got.post(s, i).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) } }(t, e) }
