import * as fs from 'fs';
const path='/lib/netifd/wireless/mac80211.sh';
let text=fs.readfile(path);
if (!text) die('Missing mac80211 driver script');
if (index(text,'function f50_phy_command(')>=0) { print('Already instrumented\n'); exit(0); }
const anchor='function setup_phy(phy, config, data) {';
let begin=index(text,anchor),end=index(text,'function iw_htmode(config) {');
if(begin<0 || end<begin)die('Unknown mac80211 layout');
let block=substr(text,begin,end-begin);
if(index(block,'system(`iw phy ${phy} set antenna')<0)die('Unknown phy command layout');
block=replace(block,'system(`iw ','f50_phy_command(`iw ');
const helper='function f50_phy_command(command) {\n\tlet rc = system(command);\n\tif (rc) log(`F50 phy command failed rc=${rc}: ${command}`);\n\treturn rc;\n}\n\n';
let result=substr(text,0,begin)+helper+block+substr(text,end);
if(fs.writefile(path,result)!=length(result))die('Write failed');
fs.chmod(path,0755);
print('PHY command errors now identify the command\n');
