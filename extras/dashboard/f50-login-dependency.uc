import * as fs from 'fs';
let path=ARGV[0] || '/usr/share/ucode/luci/template/themes/aurora/header.ut';
let source=fs.readfile(path);
if(!source) die('Missing Aurora header');
if(index(source,'f50-login-cbi')>=0) { print('Login dependency already configured\n'); exit(0); }
let original='\t\t{% if (!blank_page): %}\n\t\t<script src="{{ dispatcher.build_url(\'admin/translations\', dispatcher.lang) }}"></script>\n\t\t<script src="{{ resource }}/cbi.js?v=1.4.0"></script>\n\t\t{% endif %}';
if(length(split(source,original))!=2) die('Unknown Aurora dependency block; refusing replacement');
let fixed='\t\t{# f50-login-cbi: LuCI requires format helpers on anonymous pages too. #}\n\t\t<script src="{{ resource }}/cbi.js?v=1.4.0"></script>\n\t\t{% if (!blank_page): %}\n\t\t<script src="{{ dispatcher.build_url(\'admin/translations\', dispatcher.lang) }}"></script>\n\t\t{% endif %}';
if(!fs.writefile(path+'.f50-new',replace(source,original,fixed))) die('Header write failed');
fs.chmod(path+'.f50-new',0644);
if(!fs.rename(path+'.f50-new',path)) die('Header rename failed');
print('Anonymous LuCI format dependency configured\n');
