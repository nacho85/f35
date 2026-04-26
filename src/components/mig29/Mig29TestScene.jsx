"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, Grid, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import Mig29Iran from "./Mig29Iran";

const DOOR_NAMES = ["pivot_nose_door_R", "pivot_nose_door_L"];
const ROT_DOOR   = THREE.MathUtils.degToRad(60);  // aprox promedio R(58.3°) y L(62.8°)
const DOOR_SCALE = 0.57;
const _wp        = new THREE.Vector3();

function DoorAdjust({ domRef, adjustRef }) {
  const { scene }    = useGLTF("/mig-29-iran-anim-test.glb");
  const pivotsRef  = useRef([]);
  const basePosRef = useRef({});

  useEffect(() => {
    pivotsRef.current  = [];
    basePosRef.current = {};
    scene.traverse(o => {
      if (DOOR_NAMES.includes(o.name)) {
        pivotsRef.current.push(o);
        basePosRef.current[o.name] = o.position.clone();
      }
    });
  }, [scene]);

  useFrame(() => {
    if (!pivotsRef.current.length) return;
    const { dx, dy, dz, dAngle, hingeTilt, gearP } = adjustRef.current;
    const pDoor = THREE.MathUtils.clamp(gearP / DOOR_SCALE, 0, 1);

    const tiltRad = THREE.MathUtils.degToRad(hingeTilt);

    for (const p of pivotsRef.current) {
      const base = basePosRef.current[p.name];
      if (!base) continue;
      const isL  = p.name.endsWith("L");
      const sign = isL ? 1 : -1;

      p.position.set(base.x + dx, base.y + dy, base.z + dz);

      // dAngle: rotación pura sobre X, independiente del tilt
      const extraRx = THREE.MathUtils.degToRad(dAngle) * sign;
      const qAngle  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), extraRx);

      // animación principal sobre eje inclinado en XZ
      const animRx  = (1 - pDoor) * ROT_DOOR * sign;
      const axis    = new THREE.Vector3(1, -tiltRad * sign, 0).normalize();
      const qAnim   = new THREE.Quaternion().setFromAxisAngle(axis, animRx);

      p.quaternion.multiplyQuaternions(qAngle, qAnim);
    }

    if (domRef.current) {
      const lines = pivotsRef.current.map(o => {
        o.getWorldPosition(_wp);
        const e = o.rotation;
        const lbl = o.name.replace("pivot_nose_door_", "door_");
        return `${lbl}  x=${_wp.x.toFixed(2)} y=${_wp.y.toFixed(2)} z=${_wp.z.toFixed(2)}  rx=${THREE.MathUtils.radToDeg(e.x).toFixed(1)}°`;
      });
      domRef.current.textContent = lines.join("\n");
    }
  });

  return null;
}

const DEBUG_GLB = "/mig-29-nose-gear-groups.glb?v=10";

// Ejes de bisagra (vértices reales del mesh)
const HINGE_L_START = new THREE.Vector3(35.918, -2.103, -2.500);
const HINGE_L_END   = new THREE.Vector3(52.272, -1.547, -2.998);
const HINGE_L_AXIS  = new THREE.Vector3().subVectors(HINGE_L_END, HINGE_L_START).normalize();
const HINGE_L_MID   = new THREE.Vector3().addVectors(HINGE_L_START, HINGE_L_END).multiplyScalar(0.5);

const HINGE_R_START = new THREE.Vector3(35.918, -2.103,  2.500);
const HINGE_R_END   = new THREE.Vector3(52.272, -1.547,  2.998);
const HINGE_R_AXIS  = new THREE.Vector3().subVectors(HINGE_R_END, HINGE_R_START).normalize();
const HINGE_R_MID   = new THREE.Vector3().addVectors(HINGE_R_START, HINGE_R_END).multiplyScalar(0.5);

function makePivot(scene, prefix, hingeMid) {
  const objs = [];
  scene.traverse(o => { if (o.isMesh && o.name.startsWith(prefix)) objs.push(o); });
  if (!objs.length) return null;
  const pivot = new THREE.Group();
  pivot.position.copy(hingeMid);
  scene.add(pivot);
  for (const o of objs) {
    const wPos  = o.getWorldPosition(new THREE.Vector3());
    const wQuat = o.getWorldQuaternion(new THREE.Quaternion());
    pivot.add(o);
    o.position.copy(wPos).sub(hingeMid);
    o.quaternion.copy(wQuat);
  }
  return pivot;
}

const HIGHLIGHT_MAT = new THREE.MeshBasicMaterial({
  color: 0x00ffcc, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
});

const WHEEL_PARTS = new Set([
  'misc__004','misc__005','misc__006','misc__010','misc__011',
  'misc__016','misc__017','misc__018','misc__022','misc__023',
  'strut__001','strut__002','strut__003','strut__007','strut__008','strut__009',
  'strut__012','strut__013','strut__014','strut__015',
  'strut__019','strut__020','strut__021','strut__Object_16',
]);

const WHEEL_AXIS_PARTS = new Set([
  'strut__142','strut__143','strut__148','strut__149',
]);

const WHEEL_BRAKE_PARTS = new Set([
  'misc__176','misc__177','misc__179','misc__180','misc__181','misc__182','misc__183','misc__184',
  'misc__185','misc__186','misc__187','misc__188','misc__189','misc__190','misc__191','misc__192',
  'misc__193','misc__194','misc__195','misc__196','misc__197','misc__198','misc__199','misc__200',
  'misc__201','misc__202','misc__203','misc__206','misc__208','misc__209','misc__210','misc__211',
  'misc__212','misc__213','misc__214','misc__215','misc__216','misc__217','misc__218','misc__219',
  'misc__220','misc__221','misc__222','misc__223','misc__224','misc__225','misc__226','misc__227',
  'misc__228','misc__229','misc__230','misc__231','misc__232','misc__233','misc__234','misc__235',
  'misc__236','misc__237','misc__238','misc__239','misc__240','misc__241','misc__242','misc__243',
  'misc__244','misc__245','misc__246','misc__247','misc__248','misc__249','misc__250','misc__251',
  'misc__252','misc__253','misc__254','misc__255','misc__256','misc__257','misc__258','misc__259',
  'misc__260','misc__261','misc__262','misc__263','misc__264','misc__265','misc__266','misc__267',
  'misc__268','misc__269','misc__270','misc__271','misc__272','misc__273','misc__274','misc__275',
  'misc__276','misc__277','misc__278','misc__279','misc__280','misc__281','misc__282','misc__283',
  'misc__284','misc__285','misc__286','misc__287','misc__288','misc__289','misc__290','misc__291',
  'misc__292','misc__293','misc__294','misc__295','misc__296','misc__297','misc__298','misc__299',
  'misc__300','misc__301','misc__302','misc__303','misc__304','misc__305','misc__306','misc__307',
  'misc__308','misc__309','misc__310','misc__311','misc__312','misc__313','misc__314','misc__315',
  'misc__316','misc__317','misc__318','misc__319','misc__320','misc__321','misc__322','misc__323',
  'misc__324','misc__325','misc__326','misc__327','misc__328','misc__329','misc__330','misc__331',
  'misc__332','misc__333','misc__334','misc__335','misc__336','misc__337','misc__338','misc__339',
  'misc__340','misc__341','misc__342','misc__343','misc__344','misc__345','misc__346','misc__347',
  'misc__348','misc__349','misc__350','misc__351','misc__352','misc__353','misc__354','misc__355',
  'misc__356','misc__357','misc__358','misc__359','misc__360','misc__361','misc__362','misc__363',
  'misc__364','misc__365','misc__366','misc__367','misc__369','misc__370','misc__371','misc__372',
  'misc__373','misc__374','misc__375','misc__376','misc__377','misc__378','misc__379','misc__380',
  'misc__381','misc__382','misc__383','misc__386','misc__387','misc__388','misc__389','misc__390',
  'misc__391','misc__392','misc__393','misc__394','misc__395','misc__398','misc__399','misc__400',
  'misc__401','misc__402','misc__403','misc__404','misc__405','misc__406','misc__407','misc__408',
  'misc__409','misc__410','misc__411','misc__412','misc__413','misc__414','misc__415','misc__416',
  'misc__417','misc__418','misc__419','misc__420','misc__421','misc__422','misc__423','misc__424',
  'misc__425','misc__426','misc__427','misc__428','misc__429','misc__430','misc__431','misc__432',
  'misc__433','misc__434','misc__435','misc__436','misc__437','misc__438','misc__439','misc__440',
  'misc__441','misc__442','misc__443','misc__444','misc__445','misc__446','misc__447','misc__448',
  'misc__449','misc__450','misc__451','misc__452','misc__453','misc__454','misc__455','misc__456',
  'misc__457','misc__458','misc__459','misc__460','misc__461','misc__462','misc__463','misc__464',
  'misc__465','misc__466','misc__467','misc__468','misc__469','misc__470','misc__471','misc__472',
  'misc__473','misc__474','misc__475','misc__476','misc__477','misc__478','misc__479','misc__480',
  'misc__481','misc__482','misc__483','misc__484','misc__485','misc__486','misc__487','misc__488',
  'misc__489','misc__490','misc__491','misc__492','misc__493','misc__494','misc__495','misc__496',
  'misc__497','misc__498','misc__499','misc__500','misc__501','misc__502','misc__503','misc__504',
  'misc__505','misc__506','misc__507','misc__508','misc__509','misc__510','misc__511','misc__512',
  'misc__513','misc__514','misc__515','misc__516','misc__517','misc__518','misc__519','misc__520',
  'misc__521','misc__522','misc__523','misc__524','misc__525','misc__526','misc__527','misc__528',
  'misc__529','misc__530','misc__531','misc__532','misc__533','misc__534','misc__535','misc__536',
  'misc__537','misc__538','misc__539','misc__540','misc__541',
  'strut__141','strut__144','strut__204','strut__205','strut__207',
  'strut__368','strut__384','strut__385','strut__396','strut__397',
]);

const STEERING_STRUT_PARTS = new Set([
  'misc__159','misc__160','misc__161','misc__162','misc__163','misc__164','misc__165','misc__166',
  'misc__167','misc__168','misc__169','misc__170','misc__171','misc__172','misc__173',
  'misc__632','misc__633','misc__640','misc__644','misc__645','misc__646','misc__648',
  'misc__650','misc__651','misc__652','misc__653',
  'strut__054','strut__055','strut__056','strut__058','strut__059','strut__061','strut__062',
  'strut__063','strut__064','strut__065','strut__066','strut__067','strut__068','strut__069',
  'strut__070','strut__071','strut__072','strut__073','strut__074','strut__075','strut__076',
  'strut__077','strut__078','strut__079','strut__080','strut__081','strut__082','strut__083',
  'strut__084','strut__085','strut__086','strut__087','strut__088','strut__089','strut__090',
  'strut__091','strut__092','strut__093','strut__094','strut__095',
  'strut__1000','strut__1001','strut__1002','strut__1003','strut__1004','strut__1005','strut__1006',
  'strut__1007','strut__1008','strut__1009','strut__1010','strut__1011','strut__1012','strut__1013',
  'strut__1014','strut__1015','strut__1016','strut__1017','strut__1018','strut__1019','strut__102','strut__1020','strut__1021','strut__1022',
  'strut__1023','strut__1024','strut__1025','strut__1026','strut__1027','strut__1028','strut__1029',
  'strut__1030','strut__1031','strut__105','strut__106','strut__107','strut__111','strut__112',
  'strut__113','strut__114','strut__115','strut__116','strut__117','strut__118','strut__119',
  'strut__120','strut__121','strut__122','strut__123','strut__127','strut__128','strut__129',
  'strut__130','strut__131','strut__132','strut__133','strut__134','strut__135','strut__138',
  'strut__1387','strut__1388','strut__1389','strut__139','strut__1390','strut__1391','strut__1392',
  'strut__140','strut__150','strut__151','strut__152','strut__153','strut__154','strut__155',
  'strut__156','strut__157','strut__158','strut__1779','strut__1780',
  'strut__1902','strut__1903','strut__1904','strut__1905','strut__1906','strut__1907','strut__1908',
  'strut__1909','strut__1910','strut__1911','strut__1912','strut__1913','strut__1914','strut__1915',
  'strut__1916','strut__1917','strut__1918','strut__1919','strut__1920','strut__1921','strut__1922',
  'strut__1923','strut__1924','strut__1925',
  'strut__542','strut__545','strut__546','strut__548','strut__549','strut__550','strut__551',
  'strut__552','strut__553','strut__554','strut__555','strut__556','strut__557','strut__558',
  'strut__559','strut__560','strut__561','strut__563','strut__564','strut__565','strut__568',
  'strut__569','strut__570','strut__571','strut__572','strut__573','strut__574','strut__575',
  'strut__576','strut__577','strut__578','strut__579','strut__580','strut__581','strut__582',
  'strut__583','strut__584','strut__585','strut__586','strut__587','strut__588','strut__589',
  'strut__590','strut__591','strut__592','strut__593','strut__594','strut__595','strut__596',
  'strut__597','strut__598','strut__599','strut__600','strut__601','strut__602','strut__606',
  'strut__607','strut__608','strut__609','strut__610','strut__611','strut__612','strut__613',
  'strut__614','strut__615','strut__616','strut__617','strut__618','strut__619','strut__620','strut__621','strut__622',
  'strut__623','strut__625','strut__628','strut__629','strut__630','strut__631','strut__634',
  'strut__635','strut__636','strut__637','strut__638','strut__639','strut__641','strut__642',
  'strut__654','strut__655','strut__660','strut__665',
]);

const MAIN_STRUT_PARTS = new Set([
  'misc__096','misc__097','misc__100','misc__109',
  'misc__1207','misc__1208','misc__1211','misc__1212','misc__1213','misc__1214','misc__1215','misc__1216','misc__1217','misc__1218','misc__1219','misc__1220',
  'misc__1281','misc__1282','misc__1283','misc__1284','misc__1285','misc__1292',
  'misc__1297','misc__1298','misc__1299','misc__1300','misc__1301','misc__1302','misc__1303','misc__1304',
  'misc__1328','misc__1329','misc__1330','misc__1331','misc__1334','misc__1335','misc__1336','misc__1337','misc__1338','misc__1339','misc__1340',
  'misc__1437','misc__1438','misc__1440','misc__1441','misc__1442','misc__1443',
  'misc__1758','misc__1759','misc__1761','misc__1762','misc__1763','misc__1764','misc__1765','misc__1766','misc__1767','misc__1768','misc__1769','misc__1770','misc__1771','misc__1772','misc__1774','misc__1775','misc__1776','misc__1777','misc__1778',
  'strut__099','strut__101','strut__103',
  'strut__1032','strut__1033','strut__1034','strut__1035','strut__1036','strut__1037','strut__1038','strut__1039','strut__1040','strut__1041','strut__1042','strut__1043','strut__1044','strut__1045','strut__1046','strut__1047','strut__1048','strut__1049','strut__1050','strut__1051','strut__1052','strut__1053','strut__1054','strut__1055','strut__1056','strut__1057','strut__1058','strut__1059','strut__1060','strut__1061','strut__1062','strut__1063','strut__1064','strut__1065','strut__1066','strut__1067','strut__1068','strut__1069','strut__1070','strut__1071','strut__1072','strut__1073','strut__1074',
  'strut__1105','strut__1106','strut__1107','strut__1108','strut__1109','strut__1110','strut__1111','strut__1112','strut__1113','strut__1114','strut__1115','strut__1116','strut__1117','strut__1118','strut__1119','strut__1120','strut__1121','strut__1122','strut__1123','strut__1124','strut__1125','strut__1126','strut__1127','strut__1128','strut__1129','strut__1131','strut__1132','strut__1133','strut__1134','strut__1135','strut__1137','strut__1138','strut__1139','strut__1140','strut__1141','strut__1142','strut__1143','strut__1144','strut__1145','strut__1148','strut__1149','strut__1150','strut__1151','strut__1152','strut__1153','strut__1154','strut__1155','strut__1156','strut__1157','strut__1158','strut__1159','strut__1160','strut__1161','strut__1162','strut__1163','strut__1164','strut__1165','strut__1166','strut__1167','strut__1168','strut__1169','strut__1170','strut__1171','strut__1172','strut__1173','strut__1174','strut__1175','strut__1176','strut__1177','strut__1178','strut__1179','strut__1180','strut__1181','strut__1182','strut__1183','strut__1184','strut__1185','strut__1186','strut__1187','strut__1188','strut__1189','strut__1190','strut__1191','strut__1192','strut__1193','strut__1194','strut__1195','strut__1196','strut__1197','strut__1198','strut__1199','strut__1200','strut__1201','strut__1202','strut__1203','strut__1204','strut__1205','strut__1206','strut__1209','strut__1210',
  'strut__1221','strut__1222','strut__1223','strut__1224','strut__1225','strut__1226','strut__1227','strut__1228','strut__1229','strut__1230','strut__1231','strut__1232','strut__1233','strut__1234','strut__1235','strut__1236','strut__1237','strut__1238','strut__1239','strut__1240','strut__1241','strut__1242','strut__1243','strut__1244','strut__1245','strut__1246','strut__1247','strut__1248','strut__1249','strut__1250','strut__1251','strut__1252','strut__1253','strut__1254','strut__1255','strut__1256','strut__1257','strut__1258','strut__1259','strut__1260','strut__1261','strut__1262','strut__1264','strut__1266','strut__1267','strut__1271','strut__1272','strut__1273','strut__1274','strut__1275','strut__1276','strut__1277','strut__1278','strut__1279',
  'strut__1287','strut__1288','strut__1289','strut__1290','strut__1291','strut__1293','strut__1294','strut__1295','strut__1296',
  'strut__1332','strut__1333',
  'strut__1341','strut__1342','strut__1343','strut__1344','strut__1345','strut__1346','strut__1347','strut__1348','strut__1349','strut__1350','strut__1351','strut__1352','strut__1353','strut__1354','strut__1355','strut__1356','strut__1357','strut__1358','strut__1359','strut__1360','strut__1361','strut__1362','strut__1363','strut__1364','strut__1365','strut__1366','strut__1367','strut__1368','strut__1369','strut__1370','strut__1371','strut__1372','strut__1373','strut__1374','strut__1375','strut__1376','strut__1377','strut__1378','strut__1379','strut__1380','strut__1381','strut__1382','strut__1383','strut__1384','strut__1385','strut__1386',
  'strut__1393','strut__1394','strut__1395','strut__1397','strut__1398','strut__1399','strut__1401','strut__1402','strut__1403','strut__1404','strut__1405','strut__1407','strut__1408','strut__1409','strut__1410','strut__1411','strut__1412','strut__1413','strut__1414','strut__1415','strut__1416','strut__1417','strut__1418','strut__1419','strut__1420','strut__1421','strut__1422','strut__1423','strut__1424','strut__1425','strut__1426','strut__1427','strut__1428','strut__1429','strut__1430','strut__1431','strut__1432','strut__1433','strut__1434','strut__1435','strut__1436','strut__1439',
  'strut__1444','strut__1445','strut__1446','strut__1447','strut__1448','strut__1449','strut__1450','strut__1451','strut__1452','strut__1453','strut__1454','strut__1455','strut__1456','strut__1457','strut__1458','strut__1459','strut__1460','strut__1461','strut__1462','strut__1463','strut__1464','strut__1465','strut__1466','strut__1467','strut__1468','strut__1469','strut__1470','strut__1471','strut__1472','strut__1473','strut__1474','strut__1475','strut__1476','strut__1477','strut__1478','strut__1479','strut__1480','strut__1481','strut__1482','strut__1483','strut__1484','strut__1485','strut__1486','strut__1487','strut__1488','strut__1489','strut__1490','strut__1491','strut__1492','strut__1493','strut__1494','strut__1497','strut__1499','strut__1500','strut__1501','strut__1503','strut__1504','strut__1505','strut__1506','strut__1507','strut__1508','strut__1509','strut__1510','strut__1511','strut__1512','strut__1513','strut__1514','strut__1515','strut__1516','strut__1517','strut__1518','strut__1519','strut__1520','strut__1521','strut__1522','strut__1523','strut__1524','strut__1525','strut__1526','strut__1527','strut__1528','strut__1529','strut__1530','strut__1531','strut__1532','strut__1533','strut__1534','strut__1535','strut__1536','strut__1537','strut__1540','strut__1541','strut__1542','strut__1543','strut__1544','strut__1545','strut__1546','strut__1547','strut__1548','strut__1549','strut__1550','strut__1551','strut__1552','strut__1553','strut__1554','strut__1555','strut__1556','strut__1557','strut__1558','strut__1559','strut__1560','strut__1562','strut__1563','strut__1564','strut__1565','strut__1566','strut__1568','strut__1569','strut__1572','strut__1573','strut__1574','strut__1577','strut__1578','strut__1579','strut__1580','strut__1581','strut__1582','strut__1583','strut__1584','strut__1586','strut__1587','strut__1588','strut__1589','strut__1590','strut__1591','strut__1592','strut__1593','strut__1594','strut__1596','strut__1597','strut__1598','strut__1599','strut__1600','strut__1601','strut__1602','strut__1603','strut__1604','strut__1605','strut__1606','strut__1607','strut__1608','strut__1609','strut__1610','strut__1611','strut__1612','strut__1613','strut__1614','strut__1615','strut__1616','strut__1617','strut__1618','strut__1619','strut__1620','strut__1621','strut__1622','strut__1623','strut__1626','strut__1627','strut__1628','strut__1629','strut__1630','strut__1631','strut__1632','strut__1633','strut__1634','strut__1635','strut__1636','strut__1637','strut__1638','strut__1639','strut__1640','strut__1641','strut__1642','strut__1643','strut__1644','strut__1645','strut__1646','strut__1647','strut__1648','strut__1649','strut__1650','strut__1651','strut__1652','strut__1653','strut__1654','strut__1655','strut__1656','strut__1657','strut__1658','strut__1659','strut__1660','strut__1661','strut__1662','strut__1663','strut__1664','strut__1665','strut__1666','strut__1667','strut__1668','strut__1669','strut__1670','strut__1671','strut__1672','strut__1673','strut__1674','strut__1675','strut__1676','strut__1677','strut__1678','strut__1679','strut__1680','strut__1681','strut__1682','strut__1683','strut__1684','strut__1685','strut__1686','strut__1687','strut__1688','strut__1690','strut__1691','strut__1692','strut__1693','strut__1694','strut__1695','strut__1696','strut__1697','strut__1698','strut__1699','strut__1700','strut__1701','strut__1702','strut__1703','strut__1704','strut__1705','strut__1706','strut__1707','strut__1708','strut__1709','strut__1710','strut__1711','strut__1712','strut__1713','strut__1714','strut__1715','strut__1716','strut__1717','strut__1718','strut__1719','strut__1720','strut__1721','strut__1722','strut__1723','strut__1724','strut__1725','strut__1726','strut__1727','strut__1728','strut__1729','strut__1730','strut__1731','strut__1732','strut__1733','strut__1734','strut__1735','strut__1736','strut__1737','strut__1738','strut__1739','strut__1740','strut__1741','strut__1742','strut__1743','strut__1744','strut__1745','strut__1746','strut__1747','strut__1748','strut__1749','strut__1750','strut__1751','strut__1752','strut__1753','strut__1754','strut__1755','strut__1756','strut__1757',
  'strut__1780','strut__1782','strut__1783','strut__1785','strut__1786','strut__1787','strut__1788','strut__1790','strut__1791','strut__1792','strut__1793','strut__1794','strut__1795','strut__1796','strut__1797','strut__1798','strut__1799','strut__1802','strut__1804','strut__1805','strut__1807','strut__1809','strut__1810','strut__1811','strut__1812','strut__1813','strut__1814','strut__1815','strut__1816','strut__1817','strut__1818','strut__1819','strut__1820','strut__1821','strut__1822','strut__1823','strut__1825','strut__1826','strut__1827','strut__1828','strut__1829','strut__1830','strut__1831','strut__1832','strut__1833','strut__1834','strut__1835','strut__1836','strut__1837','strut__1838','strut__1839','strut__1840','strut__1841','strut__1842','strut__1843','strut__1844','strut__1845','strut__1846','strut__1847','strut__1848','strut__1849','strut__1850','strut__1851','strut__1853','strut__1854','strut__1855','strut__1859','strut__1860','strut__1861','strut__1864','strut__1865','strut__1866','strut__1867','strut__1868','strut__1870','strut__1871','strut__1872','strut__1873','strut__1874','strut__1875','strut__1878','strut__1879','strut__1880','strut__1881','strut__1882','strut__1883','strut__1884','strut__1885','strut__1886','strut__1887','strut__1888','strut__1889','strut__1890','strut__1891','strut__1892','strut__1893','strut__1894','strut__1895','strut__1896','strut__1897','strut__1898','strut__1899','strut__1900','strut__1901',
  'strut__930','strut__931','strut__932','strut__933','strut__934','strut__935','strut__936','strut__937','strut__938','strut__939','strut__940','strut__941','strut__942','strut__943','strut__944','strut__946','strut__947','strut__948','strut__949','strut__950','strut__951','strut__952','strut__953','strut__954','strut__955','strut__956','strut__957','strut__958','strut__959','strut__960','strut__964','strut__965','strut__966','strut__967','strut__968','strut__969','strut__970','strut__971','strut__972','strut__973','strut__974','strut__975','strut__976','strut__977','strut__978','strut__979','strut__980','strut__982','strut__983','strut__984','strut__985','strut__986','strut__987','strut__988','strut__989','strut__990','strut__991','strut__992','strut__993','strut__995','strut__996','strut__997','strut__998','strut__999',
]);

const SMALL_DOOR_PARTS = new Set([
  'compuerta_pequena__865','compuerta_pequena__866','compuerta_pequena__867','compuerta_pequena__868',
  'compuerta_pequena__869','compuerta_pequena__870','compuerta_pequena__871','compuerta_pequena__872','compuerta_pequena__873',
  'misc__887','misc__888','misc__890',
  'strut__850','strut__851','strut__852','strut__853','strut__854','strut__856','strut__858','strut__859',
  'strut__860','strut__861','strut__862','strut__863','strut__864',
  'strut__874','strut__875','strut__876','strut__877','strut__878','strut__879','strut__880','strut__881',
  'strut__882','strut__883','strut__884','strut__885','strut__886','strut__889',
]);

const CANO_AGARRE_PARTS = new Set([
  'strut__1075','strut__1076','strut__1077','strut__1078','strut__1079','strut__1080','strut__1081','strut__1082','strut__1083','strut__1084',
  'strut__1085','strut__1086','strut__1087','strut__1088','strut__1089','strut__1090','strut__1091','strut__1092','strut__1093','strut__1094',
  'strut__1095','strut__1096','strut__1097','strut__1098','strut__1099','strut__1100','strut__1101','strut__1102','strut__1103','strut__1104',
  'strut__1305','strut__1306','strut__1307','strut__1308','strut__1309','strut__1310','strut__1311','strut__1312','strut__1313','strut__1314',
  'strut__1315','strut__1316','strut__1317','strut__1318','strut__1321','strut__1322','strut__1323','strut__1324','strut__1325','strut__1326','strut__1327',
  'strut__907','strut__908','strut__909','strut__910','strut__911','strut__912','strut__913','strut__914','strut__915','strut__916',
  'strut__917','strut__918','strut__919','strut__920','strut__921','strut__922','strut__923','strut__924','strut__925','strut__926',
  'strut__927','strut__928','strut__929',
]);

const DEFAULT_LIT = new Set();

function NoseDebug({ labelRef, doorLRef, doorRRef }) {
  const { scene }    = useGLTF(DEBUG_GLB);
  const pivotLRef    = useRef(null);
  const pivotRRef    = useRef(null);
  const origMatsRef  = useRef(new Map());   // mesh uuid → original material
  const litNamesRef  = useRef(new Set());   // names currently highlighted

  useEffect(() => {
    pivotLRef.current = makePivot(scene, "compuerta_delantera_L", HINGE_L_MID);
    pivotRRef.current = makePivot(scene, "compuerta_delantera_R", HINGE_R_MID);

    // iluminar partes por defecto
    const origMats = origMatsRef.current;
    const litNames = litNamesRef.current;
    scene.traverse(o => {
      if (!o.isMesh || !DEFAULT_LIT.has(o.name)) return;
      if (!origMats.has(o.uuid)) origMats.set(o.uuid, o.material);
      o.material = HIGHLIGHT_MAT;
      litNames.add(o.uuid);
    });
  }, [scene]);

  useFrame(() => {
    if (pivotLRef.current) {
      const { p, angle } = doorLRef.current;
      pivotLRef.current.quaternion.setFromAxisAngle(HINGE_L_AXIS, -(1 - p) * THREE.MathUtils.degToRad(angle));
    }
    if (pivotRRef.current) {
      const { p, angle } = doorRRef.current;
      pivotRRef.current.quaternion.setFromAxisAngle(HINGE_R_AXIS,  (1 - p) * THREE.MathUtils.degToRad(angle));
    }
  });

  return (
    <primitive object={scene}
      onClick={e => {
        e.stopPropagation();
        const o = e.object;
        const origMats = origMatsRef.current;
        const litNames = litNamesRef.current;

        if (litNames.has(o.uuid)) {
          // deselect
          o.material = origMats.get(o.uuid);
          litNames.delete(o.uuid);
        } else {
          // select
          if (!origMats.has(o.uuid)) origMats.set(o.uuid, o.material);
          o.material = HIGHLIGHT_MAT;
          litNames.add(o.uuid);
        }

        // log nombres actuales iluminados
        const names = [];
        scene.traverse(m => { if (m.isMesh && litNames.has(m.uuid)) names.push(m.name); });
        console.log("iluminados:", names);
        if (labelRef.current) labelRef.current.textContent = names.join("\n") || "(ninguno)";
      }}
    />
  );
}
useGLTF.preload(DEBUG_GLB);

// Dibuja un segmento brillante entre dos puntos (inner core + outer halo)
function EdgeGlow({ start, end, color = "#ffff00", width = 0.06 }) {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const q   = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  return (
    <group position={mid} quaternion={q}>
      {/* core brillante */}
      <mesh renderOrder={999}>
        <cylinderGeometry args={[width * 0.4, width * 0.4, len, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      {/* halo translúcido */}
      <mesh renderOrder={998}>
        <cylinderGeometry args={[width, width, len, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function OriginalRef() {
  const { scene } = useGLTF("/mig-29-iran.glb");
  useEffect(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,   // se dibuja encima de la geometría opaca
      side: THREE.DoubleSide,
    });
    scene.traverse(o => {
      if (o.isMesh) {
        // Mostrar solo la zona de bahía delantera de Object_14
        o.visible = o.name === "Object_14";
        if (o.visible) o.material = mat;
      }
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload("/mig-29-iran.glb");

const btnStyle = (active) => ({
  padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 12,
  border: "1px solid rgba(173,191,214,0.3)",
  background: active ? "rgba(100,160,230,0.25)" : "rgba(6,10,18,0.76)",
  color: active ? "#eef4ff" : "#7a9ec4",
});

function AdjSlider({ label, value, min, max, step = 0.1, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ minWidth: 55 }}>{label}</span>
      <input type="range" min={min} max={max} step={step}
        value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: 130 }} />
      <span style={{ minWidth: 42, textAlign: "right" }}>
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  );
}

export default function Mig29TestScene() {
  const [canopyOpen,  setCanopyOpen]  = useState(false);
  const [gearDown,    setGearDown]    = useState(false);
  const [showRef,     setShowRef]     = useState(false);
  const [showDebug,   setShowDebug]   = useState(false);
  const [sliderMode,  setSliderMode]  = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [showDoorAdj, setShowDoorAdj] = useState(false);
  const [dx,     setDx]     = useState(0);
  const [dy,     setDy]     = useState(-1.2);
  const [dz,     setDz]     = useState(0);
  const [dAngle, setDAngle] = useState(0);
  const [hingeTilt, setHingeTilt] = useState(0);
  const [doorLP, setDoorLP] = useState(1);
  const [doorRP, setDoorRP] = useState(1);
  const doorDomRef  = useRef(null);
  const debugLblRef = useRef(null);
  const adjustRef  = useRef({ dx: 0, dy: 0, dz: 0, dAngle: 0, hingeTilt: 0, gearP: 0 });
  adjustRef.current = { dx, dy, dz, dAngle, hingeTilt, gearP: sliderMode ? sliderValue : gearDown ? 1 : 0 };
  const doorLRef = useRef({ p: 1, angle: 180 });
  doorLRef.current = { p: doorLP, angle: 180 };
  const doorRRef = useRef({ p: 1, angle: 180 });
  doorRRef.current = { p: doorRP, angle: 180 };

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#0b1016" }}>
      <div style={{
        position: "absolute", zIndex: 10, top: 16, left: 16,
        display: "flex", flexDirection: "column", gap: 8,
        padding: "10px 14px", borderRadius: 8,
        background: "rgba(6,10,18,0.76)", border: "1px solid rgba(173,191,214,0.16)",
        color: "#7a9ec4", fontFamily: "monospace", fontSize: 12,
        backdropFilter: "blur(12px)",
      }}>
        <div>MiG-29 Fulcrum · Test Scene · drag para orbitar</div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Canopy:</span>
          <button style={btnStyle(!canopyOpen)} onClick={() => setCanopyOpen(false)}>Cerrada</button>
          <button style={btnStyle( canopyOpen)} onClick={() => setCanopyOpen(true)}>Abierta</button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Tren:</span>
          <button style={btnStyle(!gearDown && !sliderMode)} onClick={() => { setGearDown(false); setSliderMode(false); }}>Recogido</button>
          <button style={btnStyle( gearDown && !sliderMode)} onClick={() => { setGearDown(true);  setSliderMode(false); }}>Desplegado</button>
          <button style={btnStyle(sliderMode)} onClick={() => setSliderMode(v => !v)}>Slider</button>
        </div>
        {sliderMode && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>0</span>
            <input type="range" min={0} max={100} value={Math.round(sliderValue * 100)}
              onChange={e => setSliderValue(e.target.value / 100)}
              style={{ width: 160 }} />
            <span>1</span>
            <span style={{ minWidth: 32, textAlign: "right" }}>{sliderValue.toFixed(2)}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Ref original:</span>
          <button style={btnStyle(!showRef)} onClick={() => setShowRef(false)}>Off</button>
          <button style={btnStyle( showRef)} onClick={() => setShowRef(true)}>On (azul)</button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Debug nariz:</span>
          <button style={btnStyle(!showDebug)} onClick={() => setShowDebug(false)}>Off</button>
          <button style={btnStyle( showDebug)} onClick={() => setShowDebug(true)}>On (colores)</button>
        </div>
        {showDebug && (<>
          <pre ref={debugLblRef} style={{ margin: 0, fontSize: 11, color: "#f0c060", lineHeight: 1.4 }}>
            click una parte para identificarla
          </pre>
          <AdjSlider label="cmpL p" value={doorLP} min={0.61} max={1} step={0.01} onChange={setDoorLP} />
          <AdjSlider label="cmpR p" value={doorRP} min={0.61} max={1} step={0.01} onChange={setDoorRP} />
        </>)}

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>Compuerta:</span>
          <button style={btnStyle(showDoorAdj)} onClick={() => setShowDoorAdj(v => !v)}>Ajustar</button>
          {showDoorAdj && (
            <button style={btnStyle(false)} onClick={() => { setDx(0); setDy(-1.2); setDz(0); setDAngle(0); setHingeTilt(0); }}>Reset</button>
          )}
        </div>
        {showDoorAdj && (<>
          <AdjSlider label="dx"     value={dx}     min={-15} max={15}  onChange={setDx} />
          <AdjSlider label="dy"     value={dy}     min={-5}  max={5}   onChange={setDy} />
          <AdjSlider label="dz"     value={dz}     min={-5}  max={5}   onChange={setDz} />
          <AdjSlider label="dAngle"    value={dAngle}    min={-60} max={60}  step={0.5} onChange={setDAngle} />
          <AdjSlider label="hingeTilt" value={hingeTilt} min={-15} max={15}  step={0.5} onChange={setHingeTilt} />
          <div style={{ fontSize: 10, color: "#566a80" }}>
            dx={dx.toFixed(2)} dy={dy.toFixed(2)} dz={dz.toFixed(2)} dAngle={dAngle.toFixed(1)}° tilt={hingeTilt.toFixed(1)}°
          </div>
        </>)}

        <pre ref={doorDomRef} style={{ margin: 0, fontSize: 11, color: "#adc8f0", lineHeight: 1.6 }} />
      </div>

      <Canvas camera={{ position: [16, 6, 20], fov: 42 }} shadows={{ type: THREE.PCFShadowMap }}>
        <color attach="background" args={["#0b1016"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 10, 6]} intensity={2.2} castShadow />
        <Environment preset="city" />

        <Suspense fallback={null}>
          <Mig29Iran
            canopyOpen={canopyOpen}
            gearDown={gearDown}
            gearProgressOverride={sliderMode ? sliderValue : null}
            position={[0, 0, 0]}
          />
          {showRef  && <OriginalRef />}
          {showDebug && <NoseDebug labelRef={debugLblRef} doorLRef={doorLRef} doorRRef={doorRRef} />}
          <DoorAdjust domRef={doorDomRef} adjustRef={adjustRef} />

          {showDebug && <>
            <EdgeGlow start={new THREE.Vector3(35.918, -2.103, -2.500)} end={new THREE.Vector3(52.272, -1.547, -2.998)} color="#ff8800" />
            <EdgeGlow start={new THREE.Vector3(35.918, -2.103,  2.500)} end={new THREE.Vector3(52.272, -1.547,  2.998)} color="#ff8800" />
          </>}
        </Suspense>

        <Grid position={[0, -3, 0]} args={[60, 60]}
          cellColor="#1a2a3a" sectionColor="#2a4a6a" fadeDistance={50} />
        <OrbitControls target={[0, 0, 0]} />
      </Canvas>
    </main>
  );
}
