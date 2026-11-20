// Temporary, deterministic web fixtures. No business notifications or external services.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MARK='DEMO-WEB-20261120';
const dbUrl = new URL(process.env.DATABASE_URL || '');
const liveAuthorized=process.argv.includes('--live') && process.env.FLEETGO_WEB_TEST_DATA===MARK;
if (!liveAuthorized && (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname))) throw Error('Live fixtures require the explicit --live flag and the matching FLEETGO_WEB_TEST_DATA marker.');
const prisma = new PrismaClient();
const manifestPath=path.resolve(__dirname,'../../outputs/web-test-data/manifest.json');
const database=createHash('sha256').update(`${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}`).digest('hex');
const id = key => { const h=createHash('sha256').update(`${MARK}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const date = hours => new Date(Date.now()+hours*3600000);
const label = s => `[${MARK}] ${s}`;
const sorted = v => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])) : v;
const canonical = row => JSON.stringify(sorted(row));
class CleanupDryRun extends Error {}
async function stored(tx=prisma) {
  const rows=await tx.$queryRaw`SELECT "manifest", "removedAt" FROM "web_test_datasets" WHERE "marker"=${MARK}`;
  if(rows.length)return rows[0];
  return !liveAuthorized && fs.existsSync(manifestPath) ? {manifest:JSON.parse(fs.readFileSync(manifestPath)),removedAt:null} : null;
}
async function persist(tx,manifest) {
  await tx.$executeRaw`INSERT INTO "web_test_datasets" ("marker","manifest") VALUES (${MARK},${JSON.stringify(manifest)}::jsonb) ON CONFLICT ("marker") DO NOTHING`;
}

async function seed() {
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261120,1700)`;
    const existing=await stored(tx);
    if(existing?.removedAt){console.log('This test dataset was removed previously; it will not be recreated on startup.');return;}
    if(existing) {
    const m=existing.manifest;
    if(m.database!==database)throw Error('Manifest belongs to another database.');
    for(const r of m.records)if(!await tx[r.model].findUnique({where:{id:r.id}}))throw Error('Existing fixture set is incomplete. Inspect it before reseeding.');
    await persist(tx,m);
    console.log(`Already present: ${m.records.length} tracked test records. Nothing changed.`);return;
  }
  const actor=await tx.user.findFirst({where:{status:'ACTIVE',role:{name:'SUPER_ADMIN'}}});
  if(!actor)throw Error('Run the normal local setup first; an existing active Super Admin is required.');
  const role=await tx.role.findUnique({where:{name:'VENDOR_USER'}});
  if(!role)throw Error('Vendor role missing.');
  const records=[];
    async function add(model,key,data){const row=await tx[model].create({data:{id:id(key),...data}});records.push({model,id:row.id,snapshot:canonical(row)});return row;}
    const org=await add('organization','org',{name:label('Fleet Office'),type:'JSAN',contactName:'Demo Coordinator',contactEmail:'office@example.invalid'});
    const vendor=await add('organization','vendor',{name:label('Sample Vehicle Vendor'),type:'VEHICLE_VENDOR',contactName:'Demo Receiver',contactEmail:'vendor@example.invalid'});
    const partner=await add('organization','partner',{name:label('Sample Transport Partner'),type:'TRANSPORT_PARTNER',contactName:'Demo Dispatcher',contactEmail:'transport@example.invalid'});
    const depot=await add('depot','depot',{name:label('Training Depot'),code:`${MARK}-N`,city:'Bengaluru',country:'India',address:'Fictional training location'});
    const dest=await add('depot','dest',{name:label('Receiving Depot'),code:`${MARK}-S`,city:'Mysuru',country:'India',address:'Fictional receiving location'});
    const profile=await add('vendorProfile','vendor-profile',{organizationId:vendor.id,code:`${MARK}-V`,category:'Training only',notes:label('Temporary sample profile')});
    await add('vendorContact','vendor-contact',{organizationId:vendor.id,name:label('Demo Receiver'),email:'receiver@example.invalid',isPrimary:true});
    await add('vendorLocation','vendor-location',{organizationId:vendor.id,label:label('Training yard'),city:'Mysuru',contactName:'Demo Receiver',isPrimary:true});
    const make=await add('vehicleMake','make',{name:label('Sample Make')});
    const model=await add('vehicleModel','model',{makeId:make.id,name:label('Sample Sedan'),variant:'Training variant'});
    const category=await add('vehicleCategory','category',{name:label('Passenger')});
    const type=await add('vehicleType','type',{name:label('Sedan'),categoryId:category.id});
    const fuel=await add('fuelType','fuel',{name:label('Petrol')});
    const ownership=await add('ownershipType','ownership',{name:label('Company owned')});
    await add('documentType','document-type',{name:label('Training document')});
    // Inactive on purpose: a visible sample account, not a usable new login.
    await add('user','user',{fullName:label('Sample Vendor User'),email:'fleetgo-web-demo@example.invalid',passwordHash:randomBytes(48).toString('hex'),roleId:role.id,organizationId:vendor.id,status:'INACTIVE'});
    const driver=await add('driver','driver',{name:label('Sample Driver'),phone:'0000000000',licenseNumber:`${MARK}-LIC`,licenseExpiry:date(24*365),transporterId:partner.id});
    const statuses=['AVAILABLE','RESERVED','ALLOCATED','IN_TRANSIT','AT_VENDOR','UNDER_MAINTENANCE','DAMAGED','DELIVERED'];
    const vehicles=[];
    for(let i=0;i<statuses.length;i++) {
      const vendorHeld=i===4||i===7;
      const vehicle=await add('vehicle',`vehicle-${i}`,{vehicleCode:`${MARK}-VEH-${i+1}`,registrationNumber:`DEMO20NOV${String(i+1).padStart(3,'0')}`,vidNumber:`DEMO-VID-${String(i+1).padStart(3,'0')}`,engineNumber:`DEMO-ENG-${i+1}`,makeId:make.id,modelId:model.id,typeId:type.id,categoryId:category.id,fuelTypeId:fuel.id,ownershipTypeId:ownership.id,manufacturingYear:2025,color:['White','Blue','Silver'][i%3],country:'India',organizationId:org.id,vendorId:vendorHeld?vendor.id:null,depotId:vendorHeld?dest.id:depot.id,status:statuses[i],remarks:label('Synthetic training snapshot; not a real vehicle or movement'),createdById:actor.id,insuranceProvider:'Demo Insurer',insurancePolicyNumber:`${MARK}-POL-${i+1}`,insuranceExpiry:date(24*180)});
      await add('vehicleInventory',`inventory-${i}`,{vehicleId:vehicle.id,currentDepotId:vendorHeld?dest.id:depot.id,currentCustodianType:vendorHeld?'VENDOR':i===3?'VENDOR':'DEPOT',currentCustodianId:vendorHeld?vendor.id:i===3?partner.id:depot.id,receivedAt:date(-48),receivedFromOrgId:org.id,receivingDepotId:depot.id,initialCondition:i===6?'DAMAGED':i===5?'MAINTENANCE':'GOOD',odometer:1000+i*100,remarks:label('Temporary sample snapshot; no receipt or immutable ledger is fabricated')});
      vehicles.push(vehicle);
    }
    const reservation=await add('vehicleReservation','reservation',{vehicleId:vehicles[1].id,requestingOrgId:vendor.id,depotId:depot.id,startDate:date(-1),endDate:date(72),purpose:label('Training reservation'),reference:`${MARK}-RES`,createdById:actor.id});
    await tx.vehicleInventory.update({where:{id:id('inventory-1')},data:{activeReservationId:reservation.id}});
    const recon=await add('inventoryReconciliation','recon',{scope:'DEPOT',scopeId:depot.id,notes:label('Draft physical count exercise'),startedById:actor.id});
    await add('reconciliationItem','recon-item',{reconciliationId:recon.id,vehicleId:vehicles[0].id,expectedDepotId:depot.id,result:'PENDING',remarks:label('Count this sample vehicle')});
    const ticketBase={requesterId:actor.id,requestingOrgId:vendor.id,sourceDepotId:depot.id,destinationDepotId:dest.id,requestedTypeId:type.id,requiredDate:date(48),assignedToId:actor.id};
    const approved=await add('ticket','ticket',{...ticketBase,ticketNumber:`${MARK}-TKT-001`,type:'DELIVERY',subject:label('Deliver three sample vehicles'),description:label('Training request, not a real delivery'),requestedQuantity:3,status:'APPROVED',approvalStatus:'APPROVED',submittedAt:date(-24),finalApprovalAt:date(-20)});
    await add('ticket','incident-ticket',{...ticketBase,ticketNumber:`${MARK}-TKT-002`,type:'DAMAGE_INCIDENT',subject:label('Sample left-door scratch'),description:label('Synthetic incident for reviewing the web ticket screens'),vehicleId:vehicles[6].id,status:'SUBMITTED',approvalStatus:'PENDING',submittedAt:date(-2),details:{severity:'MINOR',location:'Fictional training yard'}});
    await add('ticket','draft-ticket',{...ticketBase,ticketNumber:`${MARK}-TKT-003`,type:'GENERAL',subject:label('Draft training question'),description:label('Example of an unsubmitted draft')});
    await add('ticketComment','comment',{ticketId:approved.id,authorId:actor.id,body:label('Public sample comment; no real instruction to dispatch'),isInternal:false});
    const allocation=await add('vehicleAllocation','allocation',{reference:`${MARK}-ALC-001`,ticketId:approved.id,sourceDepotId:depot.id,destinationDepotId:dest.id,receivingOrgId:vendor.id,transporterId:partner.id,plannedDispatchAt:date(2),expectedDeliveryAt:date(12),allocatedById:actor.id});
    const dispatches=[];const trips=[];
    for(const [j,i] of [2,3,7].entries()) {
      const ia=await add('inventoryAllocation',`inventory-allocation-${j}`,{vehicleId:vehicles[i].id,organizationId:vendor.id,reference:`${MARK}-INV-${j}`,allocatedById:actor.id,...(j===2?{releasedAt:date(-2)}:{})});
      const item=await add('vehicleAllocationItem',`allocation-item-${j}`,{allocationId:allocation.id,vehicleId:vehicles[i].id,inventoryAllocationId:ia.id});
      const d=await add('dispatch',`dispatch-${j}`,{reference:`${MARK}-DSP-00${j+1}`,allocationId:allocation.id,driverId:driver.id,transporterId:partner.id,sourceDepotId:depot.id,destinationDepotId:dest.id,destinationAddress:label('Fictional receiving yard'),plannedDispatchAt:date(j===0?2:-6),expectedDeliveryAt:date(j===2?-2:12),createdById:actor.id,state:j===0?'PLANNED':'CONFIRMED',...(j>0?{confirmedById:actor.id,confirmedAt:date(-6)}:{}),instructions:label('Training only')});
      await add('dispatchVehicle',`dispatch-vehicle-${j}`,{dispatchId:d.id,allocationItemId:item.id,vehicleId:vehicles[i].id,remarks:label('Sample checklist; verify before any action')});
      const trip=await add('trip',`trip-${j}`,{reference:`${MARK}-TRP-00${j+1}`,dispatchId:d.id,status:j===0?'PLANNED':j===1?'IN_TRANSIT':'DELIVERED',remarks:label('Synthetic journey snapshot'),...(j>0?{actualStartAt:date(-6)}:{}),...(j===2?{actualArrivalAt:date(-2)}:{})});
      dispatches.push(d);trips.push(trip);
    }
    await add('operationalException','exception',{tripId:trips[1].id,type:'DELAY',description:label('Fictional traffic delay'),severity:'LOW',reportedById:actor.id});
    const template=await add('inspectionTemplate','template',{type:'RECEIVING',name:label('Receiving checklist'),description:label('Training template, not default'),createdById:actor.id});
    const inspection=await add('vehicleInspection','inspection',{reference:`${MARK}-INS-001`,type:'RECEIVING',status:'IN_PROGRESS',vehicleId:vehicles[7].id,registrationNumber:vehicles[7].registrationNumber,dispatchId:dispatches[2].id,tripId:trips[2].id,ticketId:approved.id,organizationId:vendor.id,depotId:dest.id,templateId:template.id,odometer:1700,fuelLevel:55,exteriorCondition:'Demo: minor scratch for review',interiorCondition:'Demo: good',receivingOutcome:'WITH_DISCREPANCIES',generalRemarks:label('Draft receiving exercise; no real inspection performed'),performedAt:date(-1),performedById:actor.id,createdById:actor.id});
    await add('vehicleDiscrepancy','discrepancy',{reference:`${MARK}-DISC-001`,vehicleId:vehicles[7].id,dispatchId:dispatches[2].id,inspectionId:inspection.id,organizationId:vendor.id,category:'NEW_SCRATCH',severity:'MINOR',description:label('Fictional left-door scratch'),reportedById:actor.id});
    const handover=await add('digitalHandover','handover',{reference:`${MARK}-HND-001`,type:'RECEIVING',vehicleId:vehicles[7].id,dispatchId:dispatches[2].id,tripId:trips[2].id,ticketId:approved.id,organizationId:vendor.id,inspectionId:inspection.id,handoverByName:label('Sample Driver'),receivedByName:label('Sample Receiver'),remarks:label('Pending sample handover'),createdById:actor.id});
    await add('proofOfDelivery','pod',{reference:`${MARK}-POD-001`,dispatchId:dispatches[2].id,vehicleId:vehicles[7].id,tripId:trips[2].id,ticketId:approved.id,organizationId:vendor.id,sourceDepotId:depot.id,destinationDepotId:dest.id,receivingHandoverId:handover.id,receivingInspectionId:inspection.id,generatedById:actor.id,summary:{vehicle:vehicles[7],dispatchReference:dispatches[2].reference,ticketReference:approved.ticketNumber,sourceDepot:depot.name,destinationDepot:dest.name,notes:label('SAMPLE DOCUMENT ONLY. Handover and inspection remain pending; this is not delivery evidence.'),handovers:[],photoEvidence:{preDispatch:[],receiving:[]}}});
    const provider=await add('gPSProviderConfiguration','provider',{slug:MARK.toLowerCase(),name:label('Simulated GPS'),mode:'SIMULATED',adapter:'SIMULATION'});
    const device=await add('gPSDevice','device',{providerId:provider.id,externalId:`${MARK}-GPS`,name:label('Simulated tracker')});
    await add('vehicleGPSMapping','mapping',{deviceId:device.id,vehicleId:vehicles[3].id,mode:'SIMULATED',createdById:actor.id});
    const session=await add('trackingSession','session',{vehicleId:vehicles[3].id,tripId:trips[1].id,mode:'SIMULATED',state:'CLOSED',closedAt:date(0)});
    const loc=await add('gPSLocation','location',{sessionId:session.id,vehicleId:vehicles[3].id,tripId:trips[1].id,deviceId:device.id,providerId:provider.id,mode:'SIMULATED',eventId:MARK,payloadHash:MARK,fingerprint:MARK,latitude:12.9716,longitude:77.5946,speedKph:0,address:label('Fictional Bengaluru training position'),gpsAt:date(0),quality:'VALID'});
    await tx.trackingSession.update({where:{id:session.id},data:{latestLocationId:loc.id,lastGPSAt:loc.gpsAt,lastObservedAt:loc.gpsAt}});
    await add('trackingAlert','alert',{sessionId:session.id,type:'SIGNAL_LOST',severity:'LOW',description:label('Synthetic alert for training')});
    const disk=await add('disk','disk',{diskCode:`${MARK}-DSK-001`,serialNumber:`${MARK}-SERIAL-001`,mediaType:'SSD',capacity:'1 TB',make:'Demo',model:'Training media',status:'AVAILABLE',sourceOrgId:org.id,remarks:label('Not a physical disk'),createdById:actor.id});
    await add('diskInventory','disk-inventory',{diskId:disk.id,currentDepotId:depot.id,currentCustodianType:'DEPOT',currentCustodianId:depot.id,receivedFromOrgId:org.id,remarks:label('Sample stock snapshot')});
    const shipment=await add('diskShipment','shipment',{reference:`${MARK}-SHP-001`,type:'DEPOT_TO_VENDOR',sourceDepotId:depot.id,destinationOrgId:vendor.id,transporterId:partner.id,plannedDispatchAt:date(4),expectedDeliveryAt:date(24),remarks:label('Planned training shipment'),createdById:actor.id});
    await add('diskShipmentItem','shipment-item',{shipmentId:shipment.id,diskId:disk.id,remarks:label('Sample item')});
    await add('diskReconciliation','disk-recon',{reference:`${MARK}-DREC-001`,scope:'DEPOT',scopeId:depot.id,notes:label('Draft disk count'),startedById:actor.id});
    await add('insuranceClaim','claim',{reference:`${MARK}-CLM-001`,vehicleId:vehicles[6].id,organizationId:vendor.id,incidentType:'ACCIDENT',category:'Training',incidentDate:date(-24),city:'Bengaluru',location:'Fictional training yard',description:label('Sample insurance incident; no real loss or insurer submission'),damageLevel:'LOW',reportedById:actor.id,currency:'INR',estimatedAmount:2500});
    await add('savedReport','saved-report',{name:label('Available sample vehicles'),category:'fleet',reportType:'vehicles',filters:{status:'AVAILABLE'},ownerId:actor.id,organizationId:org.id,description:label('Temporary saved report configuration')});
    // Capture final snapshots after links were filled, so cleanup detects subsequent edits.
    for(const r of records)r.snapshot=canonical(await tx[r.model].findUnique({where:{id:r.id}}));
    const manifest={marker:MARK,database,createdAt:new Date().toISOString(),records};
    await persist(tx,manifest);
    console.log(`Created ${records.length} test records. Marker: ${MARK}. Cleanup manifest saved in the database.`);
  },{timeout:60000});
}

async function cleanup(remove){
  const saved=await stored();
  if(!saved)throw Error('No tracked test dataset found.');
  if(saved.removedAt){console.log('Test dataset already removed.');return;}
  const m=saved.manifest;if(m.marker!==MARK||m.database!==database)throw Error('Wrong fixture manifest or database.');
  const allowed=new Set(['organization','depot','vendorProfile','vendorContact','vendorLocation','vehicleMake','vehicleModel','vehicleCategory','vehicleType','fuelType','ownershipType','documentType','user','driver','vehicle','vehicleInventory','vehicleReservation','inventoryReconciliation','reconciliationItem','ticket','ticketComment','vehicleAllocation','inventoryAllocation','vehicleAllocationItem','dispatch','dispatchVehicle','trip','operationalException','inspectionTemplate','vehicleInspection','vehicleDiscrepancy','digitalHandover','proofOfDelivery','gPSProviderConfiguration','gPSDevice','vehicleGPSMapping','trackingSession','gPSLocation','trackingAlert','disk','diskInventory','diskShipment','diskShipmentItem','diskReconciliation','insuranceClaim','savedReport']);
  for(const r of m.records)if(!allowed.has(r.model)||!r.id.match(/^[0-9a-f-]{36}$/))throw Error('Invalid manifest entry.');
  await prisma.$transaction(async tx=>{
    for(const r of m.records){const current=await tx[r.model].findUnique({where:{id:r.id}});if(current&&canonical(current)!==r.snapshot)throw Error(`Fixture changed: ${r.model} ${r.id}. Cleanup stopped without deleting anything. Review its newer work first.`);}
    {
      // Break only this fixture's latest-location pointer before reverse-order deletion.
      await tx.trackingSession.updateMany({where:{id:{in:m.records.filter(r=>r.model==='trackingSession').map(r=>r.id)}},data:{latestLocationId:null}});
      for(const r of [...m.records].reverse())await tx[r.model].deleteMany({where:{id:r.id}});
    }
    await persist(tx,m);
    await tx.$executeRaw`UPDATE "web_test_datasets" SET "removedAt"=CURRENT_TIMESTAMP WHERE "marker"=${MARK}`;
    if(!remove)throw new CleanupDryRun();
  },{timeout:60000}).catch(error=>{if(!(error instanceof CleanupDryRun))throw error;});
  if(remove){if(!liveAuthorized&&fs.existsSync(manifestPath))fs.renameSync(manifestPath,manifestPath+'.removed');console.log('Removed only tracked, unchanged test records. Dataset marked removed to prevent startup recreation.');}
  else console.log(`Cleanup dry run passed for ${m.records.length} records. Use --remove to remove this exact set later.`);
}
const action=process.argv[2]||'seed';
(action==='seed'?seed():action==='check'?cleanup(false):action==='--remove'?cleanup(true):Promise.reject(Error('Use seed, check, or --remove'))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
