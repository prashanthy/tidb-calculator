import React, { useState, useEffect } from 'react';

const TiDBMigrationCalculator = () => {
  // State for PostgreSQL inputs
  const [postgres, setPostgres] = useState({
    instanceType: 'db.r5.2xlarge',
    instanceCount: 2,
    storageGB: 1000,
    iops: 3000,
    readOps: 5000,
    writeOps: 1000,
    monthlyCost: 2000,
    multiAZ: true,
    readReplicas: 1
  });

  // State for workload characteristics
  const [workload, setWorkload] = useState({
    readWriteRatio: '80/20',
    type: 'OLTP', // OLTP, OLAP, Mixed
    dataGrowthRate: 10, // percentage per month
    concurrentConnections: 200,
    trafficSpikes: true,
    peakRatio: 3 // peak to normal ratio
  });

  // State for TiDB cluster configuration
  const [tidbCluster, setTidbCluster] = useState({
    tidbNodes: 3,
    tikvNodes: 3,
    pdNodes: 3,
    tiflashNodes: 0,
    useTiflash: false,
    eksClusterCount: 1, // Number of EKS clusters
    k8sWorkerNodes: 6, // Number of Kubernetes worker nodes
    availabilityZones: 3,
    dataReplicationFactor: 3 // Default replication factor
  });

  // State for EC2 instance selections
  const [instances, setInstances] = useState({
    tidbInstanceType: 'c5.4xlarge',
    tikvInstanceType: 'i3.4xlarge',
    pdInstanceType: 'm5.4xlarge',
    tiflashInstanceType: 'i3.8xlarge',
    monitoringInstanceType: 'c5.2xlarge'
  });

  // State for storage configuration
  const [storage, setStorage] = useState({
    tidbEbsType: 'gp3',
    tidbEbsSize: 100,
    tikvUseInstanceStore: true,
    tikvAdditionalEbsType: 'gp3',
    tikvAdditionalEbsSize: 0,
    pdEbsType: 'gp3',
    pdEbsSize: 100,
    tiflashEbsType: 'gp3',
    tiflashEbsSize: 1000
  });

  // State for operational costs
  const [operational, setOperational] = useState({
    backupToS3: true,
    backupSizeGB: 1000,
    networkTrafficGB: 5000,
    eksClusterCost: 73, // USD per month per cluster
    eksMonitoringCost: 200, // Additional EKS monitoring tools
    migrationCost: 5000, // One-time cost
    operationalFTE: 0.5 // Full-time equivalent staff
  });

  // EC2 instance types and pricing (approximate monthly costs)
  const ec2InstanceTypes = {
    // Compute-optimized (good for TiDB)
    "c5.2xlarge": { vCPU: 8, memory: 16, monthlyCost: 246, description: "Good for TiDB servers" },
    "c5.4xlarge": { vCPU: 16, memory: 32, monthlyCost: 493, description: "Recommended for TiDB servers" },
    "c5.9xlarge": { vCPU: 36, memory: 72, monthlyCost: 1109, description: "High performance TiDB" },
    
    // Memory-optimized (good for high memory workloads)
    "r5.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 387, description: "Memory optimized" },
    "r5.4xlarge": { vCPU: 16, memory: 128, monthlyCost: 774, description: "High memory" },
    "r5.8xlarge": { vCPU: 32, memory: 256, monthlyCost: 1548, description: "Very high memory" },
    
    // General purpose (good for PD)
    "m5.2xlarge": { vCPU: 8, memory: 32, monthlyCost: 278, description: "Good for PD nodes" },
    "m5.4xlarge": { vCPU: 16, memory: 64, monthlyCost: 556, description: "High performance PD" },
    
    // Storage optimized with NVMe (best for TiKV)
    "i3.2xlarge": { vCPU: 8, memory: 61, monthlyCost: 499, nvme: 1900, description: "Recommended for TiKV" },
    "i3.4xlarge": { vCPU: 16, memory: 122, monthlyCost: 998, nvme: 3800, description: "High performance TiKV" },
    "i3.8xlarge": { vCPU: 32, memory: 244, monthlyCost: 1995, nvme: 7600, description: "Very high performance TiKV" },
    "i3en.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 623, nvme: 5000, description: "Storage optimized TiKV" },
    "i3en.3xlarge": { vCPU: 12, memory: 96, monthlyCost: 935, nvme: 7500, description: "Storage optimized TiKV+" }
  };

  // EBS volume types and pricing
  const ebsVolumeTypes = {
    "gp3": { basePrice: 0.08, throughputPrice: 0.04, iopsPrice: 0.005 }, // per GB-month
    "gp2": { basePrice: 0.10 }, // per GB-month
    "io1": { basePrice: 0.125, iopsPrice: 0.065 }, // per GB-month, per provisioned IOPS-month
    "io2": { basePrice: 0.125, iopsPrice: 0.065 } // per GB-month, per provisioned IOPS-month
  };

  // PostgreSQL instance types and pricing (approximate monthly costs)
  const postgresInstanceTypes = {
    "db.m5.large": { vCPU: 2, memory: 8, monthlyCost: 218 },
    "db.m5.xlarge": { vCPU: 4, memory: 16, monthlyCost: 437 },
    "db.m5.2xlarge": { vCPU: 8, memory: 32, monthlyCost: 874 },
    "db.r5.large": { vCPU: 2, memory: 16, monthlyCost: 276 },
    "db.r5.xlarge": { vCPU: 4, memory: 32, monthlyCost: 552 },
    "db.r5.2xlarge": { vCPU: 8, memory: 64, monthlyCost: 1104 },
    "db.r5.4xlarge": { vCPU: 16, memory: 128, monthlyCost: 2208 }
  };

  // Handler for PostgreSQL input changes
  const handlePostgresChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPostgres(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  // Handler for workload input changes
  const handleWorkloadChange = (e) => {
    const { name, value, type, checked } = e.target;
    setWorkload(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  // Handler for TiDB cluster input changes
  const handleTidbClusterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTidbCluster(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  // Handler for EC2 instance input changes
  const handleInstanceChange = (e) => {
    const { name, value } = e.target;
    setInstances(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handler for storage input changes
  const handleStorageChange = (e) => {
    const { name, value, type, checked } = e.target;
    setStorage(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  // Handler for operational input changes
  const handleOperationalChange = (e) => {
    const { name, value, type, checked } = e.target;
    setOperational(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  // Auto-calculate TiDB resources based on PostgreSQL specs
  useEffect(() => {
    // Calculate PostgreSQL processing power (vCPU × instances)
    const postgresVcpu = postgresInstanceTypes[postgres.instanceType]?.vCPU || 8;
    const postgresMemory = postgresInstanceTypes[postgres.instanceType]?.memory || 32;
    const totalPostgresVcpu = postgresVcpu * postgres.instanceCount;
    const totalPostgresMemory = postgresMemory * postgres.instanceCount;
    
    // Add read replicas to processing power calculation
    const readReplicaVcpu = totalPostgresVcpu * (postgres.readReplicas / postgres.instanceCount);
    const effectivePostgresVcpu = totalPostgresVcpu + readReplicaVcpu;
    
    // In TiDB, SQL processing is done by TiDB nodes - calculate equivalent TiDB nodes
    // TiDB nodes are most closely comparable to PostgreSQL primary instances in function
    // Minimum of 3 TiDB nodes for HA, and each TiDB node has approximately 16 vCPU in a typical deployment (c5.4xlarge)
    const vcpuPerTidbNode = 16; // Default assumption based on c5.4xlarge
    const suggestedTidbNodesFromCpu = Math.max(3, Math.ceil(effectivePostgresVcpu / vcpuPerTidbNode));
    
    // Also calculate based on connections (balancing factor)
    const suggestedTidbNodesFromConn = Math.max(3, Math.ceil(workload.concurrentConnections / 500));
    
    // Take the larger of the two suggestions
    const baseTidbNodes = Math.max(suggestedTidbNodesFromCpu, suggestedTidbNodesFromConn);
    
    // Estimate TiKV nodes based on size and workload
    // Formula based on TiDB Cloud docs: ceil(data_size * compression_ratio * replicas / storage_usage_ratio / node_capacity / 3) * 3
    const compressionRatio = 0.4; // Typical compression ratio of 40%
    const storageUsageRatio = 0.8; // Recommended to keep usage below 80%
    const defaultNodeCapacity = 4000; // 4TB in GB - recommended max for PCIe SSD
    const suggestedTikvNodesForStorage = Math.ceil(
      (postgres.storageGB * compressionRatio * tidbCluster.dataReplicationFactor) / 
      (storageUsageRatio * defaultNodeCapacity * 3)
    ) * 3;
    
    // Calculate TiKV nodes based on write operations (TiKV is CPU sensitive for writes)
    // General rule: 1 TiKV node per X write operations
    const writesPerTikvNode = 5000; // Approximate writes per TiKV node
    const suggestedTikvNodesFromWrites = Math.max(3, Math.ceil(postgres.writeOps / writesPerTikvNode / 3) * 3);
    
    // Minimum of 3 TiKV nodes required
    const suggestedTikvNodes = Math.max(3, Math.max(suggestedTikvNodesForStorage, suggestedTikvNodesFromWrites));
    
    // More TiKV nodes for write-heavy workloads
    const writeHeavyFactor = workload.readWriteRatio.startsWith('50') ? 1.5 : 
                            workload.readWriteRatio.startsWith('30') ? 2 : 1;
    
    // TiFlash nodes for OLAP or Mixed workloads (analytics)
    const useTiflash = workload.type === 'OLAP' || workload.type === 'Mixed';
    
    // TiFlash replica calculation based on TiDB docs
    const tiflashReplicas = useTiflash ? 2 : 0; // Recommended minimum 2 replicas
    const suggestedTiflashNodes = useTiflash ? 
      Math.max(2, Math.ceil((postgres.storageGB * compressionRatio * tiflashReplicas) / 
      (tidbCluster.dataReplicationFactor * storageUsageRatio * defaultNodeCapacity))) : 0;
    
    // Adjust for traffic spikes
    const spikeFactor = workload.trafficSpikes ? Math.min(2, workload.peakRatio / 2) : 1;
    
    // Calculate number of worker nodes required
    // Each worker node can typically host 1-2 TiDB components
    const componentsPerWorker = 1.5; // Average components per worker node
    const totalComponents = 
      Math.ceil(baseTidbNodes * spikeFactor) + 
      Math.ceil(suggestedTikvNodes * writeHeavyFactor) + 
      tidbCluster.pdNodes + 
      suggestedTiflashNodes + 
      1; // +1 for monitoring
    const suggestedWorkerNodes = Math.max(6, Math.ceil(totalComponents / componentsPerWorker));
    
    setTidbCluster(prev => ({
      ...prev,
      tidbNodes: Math.ceil(baseTidbNodes * spikeFactor),
      tikvNodes: Math.ceil(suggestedTikvNodes * writeHeavyFactor),
      useTiflash: useTiflash,
      tiflashNodes: suggestedTiflashNodes,
      k8sWorkerNodes: suggestedWorkerNodes
    }));
    
    // Update instance types based on PostgreSQL configuration
    // If PostgreSQL is using high-memory instances, suggest similar for TiDB
    if (postgresMemory >= 128) {
      setInstances(prev => ({
        ...prev,
        tidbInstanceType: "r5.4xlarge" // High memory option
      }));
    } else if (postgresMemory >= 64) {
      setInstances(prev => ({
        ...prev,
        tidbInstanceType: "r5.2xlarge" // Medium-high memory option
      }));
    }
  }, [
    postgres.storageGB,
    postgres.instanceType,
    postgres.instanceCount,
    postgres.readReplicas,
    postgres.writeOps,
    workload.concurrentConnections, 
    workload.readWriteRatio, 
    workload.type,
    workload.trafficSpikes,
    workload.peakRatio,
    tidbCluster.dataReplicationFactor,
    tidbCluster.pdNodes
  ]);

  // Calculate EBS storage costs
  const calculateEbsCost = (type, sizeGB, iops = 3000, throughput = 125) => {
    if (sizeGB === 0) return 0;
    
    const ebsType = ebsVolumeTypes[type] || ebsVolumeTypes.gp3;
    let cost = sizeGB * ebsType.basePrice;
    
    if (type === "gp3" && iops > 3000) {
      cost += (iops - 3000) * ebsType.iopsPrice;
    }
    
    if (type === "gp3" && throughput > 125) {
      cost += (throughput - 125) * ebsType.throughputPrice;
    }
    
    if ((type === "io1" || type === "io2") && iops) {
      cost += iops * ebsType.iopsPrice;
    }
    
    return cost;
  };

  // Extract instance costs
  const tidbInstanceCost = ec2InstanceTypes[instances.tidbInstanceType]?.monthlyCost || 493;
  const tikvInstanceCost = ec2InstanceTypes[instances.tikvInstanceType]?.monthlyCost || 998;
  const pdInstanceCost = ec2InstanceTypes[instances.pdInstanceType]?.monthlyCost || 278;
  const tiflashInstanceCost = ec2InstanceTypes[instances.tiflashInstanceType]?.monthlyCost || 1995;
  const monitoringInstanceCost = ec2InstanceTypes[instances.monitoringInstanceType]?.monthlyCost || 246;

  // Calculate total EC2 instance costs
  const totalInstanceCost = 
    tidbInstanceCost * tidbCluster.tidbNodes +
    tikvInstanceCost * tidbCluster.tikvNodes +
    pdInstanceCost * tidbCluster.pdNodes +
    tiflashInstanceCost * tidbCluster.tiflashNodes +
    monitoringInstanceCost;

  // Calculate storage costs
  const tidbStorageCost = calculateEbsCost(storage.tidbEbsType, storage.tidbEbsSize) * tidbCluster.tidbNodes;
  
  const tikvUsingInstanceStore = storage.tikvUseInstanceStore && ec2InstanceTypes[instances.tikvInstanceType]?.nvme;
  const tikvInstanceStorageSize = tikvUsingInstanceStore ? (ec2InstanceTypes[instances.tikvInstanceType]?.nvme || 0) : 0;
  const tikvAdditionalStorageCost = calculateEbsCost(storage.tikvAdditionalEbsType, storage.tikvAdditionalEbsSize) * tidbCluster.tikvNodes;
  
  const pdStorageCost = calculateEbsCost(storage.pdEbsType, storage.pdEbsSize) * tidbCluster.pdNodes;
  const tiflashStorageCost = calculateEbsCost(storage.tiflashEbsType, storage.tiflashEbsSize) * tidbCluster.tiflashNodes;
  
  const totalStorageCost = tidbStorageCost + tikvAdditionalStorageCost + pdStorageCost + tiflashStorageCost;

  // S3 backup costs
  const s3BackupCost = operational.backupToS3 ? operational.backupSizeGB * 0.023 : 0; // $0.023 per GB per month

  // Network costs
  const networkCost = operational.networkTrafficGB * 0.01; // $0.01 per GB (simplified)

  // Calculate Kubernetes management costs
  const eksClusterCost = tidbCluster.eksClusterCount * operational.eksClusterCost;
  const eksMonitoringCost = operational.eksMonitoringCost;
  const totalKubernetesCost = eksClusterCost + eksMonitoringCost;

  // Calculate total recurring monthly costs
  const totalMonthlyCost = totalInstanceCost + totalStorageCost + s3BackupCost + networkCost + totalKubernetesCost;

  // Calculate one-time costs
  const oneTimeCosts = operational.migrationCost;

  // Calculate savings vs PostgreSQL
  const postgresMonthlyCost = postgres.monthlyCost;
  const monthlySavings = postgresMonthlyCost - totalMonthlyCost;
  const savingsPercentage = postgresMonthlyCost > 0 ? (monthlySavings / postgresMonthlyCost) * 100 : 0;
  const paybackPeriodMonths = monthlySavings > 0 ? oneTimeCosts / monthlySavings : Infinity;

  return (
    <div className="mx-auto p-4 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6 text-center">TiDB Migration from PostgreSQL Cost Calculator</h1>
      <div className="mb-4 bg-blue-100 p-3 rounded">
        <p className="text-sm">This calculator now takes PostgreSQL instance type and count into consideration when calculating TiDB resource requirements and costs.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-6">
          {/* PostgreSQL Current Setup */}
          <div className="bg-blue-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Current PostgreSQL Environment</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">Instance Type</label>
                <select
                  name="instanceType"
                  value={postgres.instanceType}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(postgresInstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({postgresInstanceTypes[type].vCPU} vCPU, {postgresInstanceTypes[type].memory} GB)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Primary Instances</label>
                <input
                  type="number"
                  name="instanceCount"
                  value={postgres.instanceCount}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Storage (GB)</label>
                <input
                  type="number"
                  name="storageGB"
                  value={postgres.storageGB}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Provisioned IOPS</label>
                <input
                  type="number"
                  name="iops"
                  value={postgres.iops}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Read Operations/sec</label>
                <input
                  type="number"
                  name="readOps"
                  value={postgres.readOps}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Write Operations/sec</label>
                <input
                  type="number"
                  name="writeOps"
                  value={postgres.writeOps}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Current Monthly Cost ($)</label>
                <input
                  type="number"
                  name="monthlyCost"
                  value={postgres.monthlyCost}
                  onChange={handlePostgresChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div className="flex items-center space-x-4 pt-4">
                <div>
                  <input
                    type="checkbox"
                    name="multiAZ"
                    checked={postgres.multiAZ}
                    onChange={handlePostgresChange}
                    className="mr-2"
                  />
                  <label>Multi-AZ</label>
                </div>
                <div>
                  <label className="mr-2">Read Replicas:</label>
                  <input
                    type="number"
                    name="readReplicas"
                    value={postgres.readReplicas}
                    onChange={handlePostgresChange}
                    className="w-16 p-1 border rounded"
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Workload Characteristics */}
          <div className="bg-purple-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Workload Characteristics</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">Read/Write Ratio</label>
                <select
                  name="readWriteRatio"
                  value={workload.readWriteRatio}
                  onChange={handleWorkloadChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="90/10">90/10 (Read-heavy)</option>
                  <option value="80/20">80/20 (Typical)</option>
                  <option value="50/50">50/50 (Balanced)</option>
                  <option value="30/70">30/70 (Write-heavy)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Workload Type</label>
                <select
                  name="type"
                  value={workload.type}
                  onChange={handleWorkloadChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="OLTP">OLTP (Transactional)</option>
                  <option value="OLAP">OLAP (Analytical)</option>
                  <option value="Mixed">Mixed (HTAP)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Data Growth Rate (%/month)</label>
                <input
                  type="number"
                  name="dataGrowthRate"
                  value={workload.dataGrowthRate}
                  onChange={handleWorkloadChange}
                  className="w-full p-2 border rounded"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Peak Concurrent Connections</label>
                <input
                  type="number"
                  name="concurrentConnections"
                  value={workload.concurrentConnections}
                  onChange={handleWorkloadChange}
                  className="w-full p-2 border rounded"
                  min="1"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    name="trafficSpikes"
                    checked={workload.trafficSpikes}
                    onChange={handleWorkloadChange}
                    className="mr-2"
                  />
                  <label>Traffic Spikes</label>
                </div>
                {workload.trafficSpikes && (
                  <div className="flex items-center">
                    <label className="mr-2">Peak-to-Normal Ratio:</label>
                    <input
                      type="number"
                      name="peakRatio"
                      value={workload.peakRatio}
                      onChange={handleWorkloadChange}
                      className="w-16 p-2 border rounded"
                      min="1"
                      step="0.5"
                    />
                    <span className="ml-2">x</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* TiDB Cluster Configuration */}
          <div className="bg-green-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">TiDB Cluster Configuration</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">TiDB Nodes</label>
                <input
                  type="number"
                  name="tidbNodes"
                  value={tidbCluster.tidbNodes}
                  onChange={handleTidbClusterChange}
                  className="w-full p-2 border rounded"
                  min="3"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">TiKV Nodes</label>
                <input
                  type="number"
                  name="tikvNodes"
                  value={tidbCluster.tikvNodes}
                  onChange={handleTidbClusterChange}
                  className="w-full p-2 border rounded"
                  min="3"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">PD Nodes</label>
                <input
                  type="number"
                  name="pdNodes"
                  value={tidbCluster.pdNodes}
                  onChange={handleTidbClusterChange}
                  className="w-full p-2 border rounded"
                  min="3"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="useTiflash"
                  checked={tidbCluster.useTiflash}
                  onChange={handleTidbClusterChange}
                  className="mr-2"
                />
                <label>Use TiFlash (HTAP)</label>
              </div>
              {tidbCluster.useTiflash && (
                <div>
                  <label className="block text-sm mb-1">TiFlash Nodes</label>
                  <input
                    type="number"
                    name="tiflashNodes"
                    value={tidbCluster.tiflashNodes}
                    onChange={handleTidbClusterChange}
                    className="w-full p-2 border rounded"
                    min="1"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm mb-1">EKS Clusters</label>
                <input
                  type="number"
                  name="eksClusterCount"
                  value={tidbCluster.eksClusterCount}
                  onChange={handleTidbClusterChange}
                  className="w-full p-2 border rounded"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">K8s Worker Nodes</label>
                <input
                  type="number"
                  name="k8sWorkerNodes"
                  value={tidbCluster.k8sWorkerNodes}
                  onChange={handleTidbClusterChange}
                  className="w-full p-2 border rounded"
                  min="3"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Data Replication Factor</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    name="dataReplicationFactor"
                    value={tidbCluster.dataReplicationFactor}
                    onChange={handleTidbClusterChange}
                    className="w-24 p-2 border rounded"
                    min="3"
                    max="5"
                  />
                  <span className="ml-2 text-sm text-gray-600">(Default: 3, min: 3)</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* EC2 Instance Types */}
          <div className="bg-yellow-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">EC2 Instance Selection</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">TiDB Server Instances</label>
                <select
                  name="tidbInstanceType"
                  value={instances.tidbInstanceType}
                  onChange={handleInstanceChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(ec2InstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({ec2InstanceTypes[type].vCPU} vCPU, {ec2InstanceTypes[type].memory} GB)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">TiKV Server Instances</label>
                <select
                  name="tikvInstanceType"
                  value={instances.tikvInstanceType}
                  onChange={handleInstanceChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(ec2InstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({ec2InstanceTypes[type].vCPU} vCPU, {ec2InstanceTypes[type].memory} GB
                      {ec2InstanceTypes[type].nvme ? `, ${ec2InstanceTypes[type].nvme} GB NVMe` : ''})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">PD Server Instances</label>
                <select
                  name="pdInstanceType"
                  value={instances.pdInstanceType}
                  onChange={handleInstanceChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(ec2InstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({ec2InstanceTypes[type].vCPU} vCPU, {ec2InstanceTypes[type].memory} GB)
                    </option>
                  ))}
                </select>
              </div>
              {tidbCluster.useTiflash && (
                <div>
                  <label className="block text-sm mb-1">TiFlash Server Instances</label>
                  <select
                    name="tiflashInstanceType"
                    value={instances.tiflashInstanceType}
                    onChange={handleInstanceChange}
                    className="w-full p-2 border rounded"
                  >
                    {Object.keys(ec2InstanceTypes).map(type => (
                      <option key={type} value={type}>
                        {type} ({ec2InstanceTypes[type].vCPU} vCPU, {ec2InstanceTypes[type].memory} GB
                        {ec2InstanceTypes[type].nvme ? `, ${ec2InstanceTypes[type].nvme} GB NVMe` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm mb-1">Monitoring Instance</label>
                <select
                  name="monitoringInstanceType"
                  value={instances.monitoringInstanceType}
                  onChange={handleInstanceChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.keys(ec2InstanceTypes).map(type => (
                    <option key={type} value={type}>
                      {type} ({ec2InstanceTypes[type].vCPU} vCPU, {ec2InstanceTypes[type].memory} GB)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Storage Configuration */}
          <div className="bg-red-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Storage Configuration</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">TiDB Server Storage</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    name="tidbEbsType"
                    value={storage.tidbEbsType}
                    onChange={handleStorageChange}
                    className="w-full p-2 border rounded"
                  >
                    {Object.keys(ebsVolumeTypes).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <div className="flex items-center">
                    <input
                      type="number"
                      name="tidbEbsSize"
                      value={storage.tidbEbsSize}
                      onChange={handleStorageChange}
                      className="w-full p-2 border rounded"
                      min="0"
                    />
                    <span className="ml-2">GB</span>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    name="tikvUseInstanceStore"
                    checked={storage.tikvUseInstanceStore}
                    onChange={handleStorageChange}
                    className="mr-2"
                  />
                  <label>Use Instance Store for TiKV (if available)</label>
                </div>
                {tikvUsingInstanceStore && (
                  <div className="bg-gray-100 p-2 rounded mb-2">
                    <span className="text-sm">
                      Using {tikvInstanceStorageSize} GB NVMe storage from i3 instance
                    </span>
                  </div>
                )}
                <label className="block text-sm mb-1">Additional TiKV EBS Storage</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    name="tikvAdditionalEbsType"
                    value={storage.tikvAdditionalEbsType}
                    onChange={handleStorageChange}
                    className="w-full p-2 border rounded"
                  >
                    {Object.keys(ebsVolumeTypes).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <div className="flex items-center">
                    <input
                      type="number"
                      name="tikvAdditionalEbsSize"
                      value={storage.tikvAdditionalEbsSize}
                      onChange={handleStorageChange}
                      className="w-full p-2 border rounded"
                      min="0"
                    />
                    <span className="ml-2">GB</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm mb-1">PD Server Storage</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    name="pdEbsType"
                    value={storage.pdEbsType}
                    onChange={handleStorageChange}
                    className="w-full p-2 border rounded"
                  >
                    {Object.keys(ebsVolumeTypes).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <div className="flex items-center">
                    <input
                      type="number"
                      name="pdEbsSize"
                      value={storage.pdEbsSize}
                      onChange={handleStorageChange}
                      className="w-full p-2 border rounded"
                      min="0"
                    />
                    <span className="ml-2">GB</span>
                  </div>
                </div>
              </div>
              
              {tidbCluster.useTiflash && (
                <div>
                  <label className="block text-sm mb-1">TiFlash Storage</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      name="tiflashEbsType"
                      value={storage.tiflashEbsType}
                      onChange={handleStorageChange}
                      className="w-full p-2 border rounded"
                    >
                      {Object.keys(ebsVolumeTypes).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <div className="flex items-center">
                      <input
                        type="number"
                        name="tiflashEbsSize"
                        value={storage.tiflashEbsSize}
                        onChange={handleStorageChange}
                        className="w-full p-2 border rounded"
                        min="0"
                      />
                      <span className="ml-2">GB</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Operational Costs */}
          <div className="bg-indigo-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Operational Costs</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  name="backupToS3"
                  checked={operational.backupToS3}
                  onChange={handleOperationalChange}
                  className="mr-2"
                />
                <label>Backup to S3</label>
              </div>
              {operational.backupToS3 && (
                <div>
                  <label className="block text-sm mb-1">Backup Size (GB)</label>
                  <input
                    type="number"
                    name="backupSizeGB"
                    value={operational.backupSizeGB}
                    onChange={handleOperationalChange}
                    className="w-full p-2 border rounded"
                    min="0"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm mb-1">Network Traffic (GB/month)</label>
                <input
                  type="number"
                  name="networkTrafficGB"
                  value={operational.networkTrafficGB}
                  onChange={handleOperationalChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">EKS Cluster Cost ($)</label>
                <input
                  type="number"
                  name="eksClusterCost"
                  value={operational.eksClusterCost}
                  onChange={handleOperationalChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">EKS Monitoring Tools ($)</label>
                <input
                  type="number"
                  name="eksMonitoringCost"
                  value={operational.eksMonitoringCost}
                  onChange={handleOperationalChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Migration Cost ($)</label>
                <input
                  type="number"
                  name="migrationCost"
                  value={operational.migrationCost}
                  onChange={handleOperationalChange}
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Results Section */}
        <div className="space-y-6">
          {/* Total TiDB Resources */}
          <div className="bg-green-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Total Resources</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm">Estimated TiDB Nodes</div>
                <div className="text-2xl font-bold">{tidbCluster.tidbNodes}</div>
              </div>
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm">Estimated TiKV Nodes</div>
                <div className="text-2xl font-bold">{tidbCluster.tikvNodes}</div>
              </div>
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm">Estimated PD Nodes</div>
                <div className="text-2xl font-bold">{tidbCluster.pdNodes}</div>
              </div>
              {tidbCluster.useTiflash && (
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">Estimated TiFlash Nodes</div>
                  <div className="text-2xl font-bold">{tidbCluster.tiflashNodes}</div>
                </div>
              )}
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm">Total Storage (GB)</div>
                <div className="text-2xl font-bold">
                  {(tidbCluster.tidbNodes * storage.tidbEbsSize) + 
                   (tidbCluster.tikvNodes * (tikvInstanceStorageSize + storage.tikvAdditionalEbsSize)) + 
                   (tidbCluster.pdNodes * storage.pdEbsSize) + 
                   (tidbCluster.tiflashNodes * storage.tiflashEbsSize)}
                </div>
              </div>
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm">Region Count</div>
                <div className="text-2xl font-bold">1</div>
              </div>
            </div>
          </div>
          
          {/* Cost Breakdown */}
          <div className="bg-yellow-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Monthly Cost Breakdown</h2>
            <div className="overflow-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-yellow-100">
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Subcategory</th>
                    <th className="p-2 text-right">Cost ($)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">EC2</td>
                    <td className="p-2">TiDB Servers ({tidbCluster.tidbNodes}x {instances.tidbInstanceType})</td>
                    <td className="p-2 text-right">${(tidbInstanceCost * tidbCluster.tidbNodes).toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">EC2</td>
                    <td className="p-2">TiKV Servers ({tidbCluster.tikvNodes}x {instances.tikvInstanceType})</td>
                    <td className="p-2 text-right">${(tikvInstanceCost * tidbCluster.tikvNodes).toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">EC2</td>
                    <td className="p-2">PD Servers ({tidbCluster.pdNodes}x {instances.pdInstanceType})</td>
                    <td className="p-2 text-right">${(pdInstanceCost * tidbCluster.pdNodes).toFixed(2)}</td>
                  </tr>
                  {tidbCluster.useTiflash && (
                    <tr className="border-b">
                      <td className="p-2">EC2</td>
                      <td className="p-2">TiFlash Servers ({tidbCluster.tiflashNodes}x {instances.tiflashInstanceType})</td>
                      <td className="p-2 text-right">${(tiflashInstanceCost * tidbCluster.tiflashNodes).toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="p-2">EC2</td>
                    <td className="p-2">Monitoring (1x {instances.monitoringInstanceType})</td>
                    <td className="p-2 text-right">${monitoringInstanceCost.toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Storage</td>
                    <td className="p-2">TiDB EBS Volumes ({storage.tidbEbsType})</td>
                    <td className="p-2 text-right">${tidbStorageCost.toFixed(2)}</td>
                  </tr>
                  {storage.tikvAdditionalEbsSize > 0 && (
                    <tr className="border-b">
                      <td className="p-2">Storage</td>
                      <td className="p-2">TiKV Additional EBS ({storage.tikvAdditionalEbsType})</td>
                      <td className="p-2 text-right">${tikvAdditionalStorageCost.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="p-2">Storage</td>
                    <td className="p-2">PD EBS Volumes ({storage.pdEbsType})</td>
                    <td className="p-2 text-right">${pdStorageCost.toFixed(2)}</td>
                  </tr>
                  {tidbCluster.useTiflash && (
                    <tr className="border-b">
                      <td className="p-2">Storage</td>
                      <td className="p-2">TiFlash EBS Volumes ({storage.tiflashEbsType})</td>
                      <td className="p-2 text-right">${tiflashStorageCost.toFixed(2)}</td>
                    </tr>
                  )}
                  {operational.backupToS3 && (
                    <tr className="border-b">
                      <td className="p-2">Backup</td>
                      <td className="p-2">S3 Storage ({operational.backupSizeGB} GB)</td>
                      <td className="p-2 text-right">${s3BackupCost.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="p-2">Network</td>
                    <td className="p-2">Data Transfer ({operational.networkTrafficGB} GB)</td>
                    <td className="p-2 text-right">${networkCost.toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Kubernetes</td>
                    <td className="p-2">EKS Cluster ({tidbCluster.eksClusterCount}x)</td>
                    <td className="p-2 text-right">${eksClusterCost.toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Kubernetes</td>
                    <td className="p-2">EKS Monitoring Tools</td>
                    <td className="p-2 text-right">${eksMonitoringCost.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-yellow-100 font-bold">
                    <td className="p-2">Total</td>
                    <td className="p-2">Monthly Cost</td>
                    <td className="p-2 text-right">${totalMonthlyCost.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* One-time Costs */}
          <div className="bg-orange-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">One-time Costs</h2>
            <div className="overflow-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-orange-100">
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-right">Cost ($)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">Migration</td>
                    <td className="p-2 text-right">${operational.migrationCost.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-orange-100 font-bold">
                    <td className="p-2">Total One-time Costs</td>
                    <td className="p-2 text-right">${oneTimeCosts.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Comparative Analysis */}
          <div className="bg-blue-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Cost Comparison</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">Current PostgreSQL Monthly Cost</div>
                  <div className="text-2xl font-bold">${postgresMonthlyCost.toFixed(2)}</div>
                </div>
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">TiDB Monthly Cost</div>
                  <div className="text-2xl font-bold">${totalMonthlyCost.toFixed(2)}</div>
                </div>
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">Monthly Savings</div>
                  <div className={`text-2xl font-bold ${monthlySavings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${monthlySavings.toFixed(2)}
                  </div>
                </div>
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">Savings Percentage</div>
                  <div className={`text-2xl font-bold ${savingsPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {savingsPercentage.toFixed(1)}%
                  </div>
                </div>
              </div>
              
              {monthlySavings > 0 && (
                <div className="bg-white p-3 rounded shadow">
                  <div className="text-gray-600 text-sm">Payback Period for One-time Costs</div>
                  <div className="text-2xl font-bold">
                    {isFinite(paybackPeriodMonths) ? 
                      `${paybackPeriodMonths.toFixed(1)} months` : 
                      'N/A'}
                  </div>
                </div>
              )}
              
              <div className="bg-white p-3 rounded shadow">
                <div className="text-gray-600 text-sm mb-2">Key TiDB Sizing Guidelines</div>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>TiDB (SQL layer): Min 8 CPU cores per node recommended</li>
                  <li>TiKV (Storage): Best on i3/i3en instances with NVMe storage</li>
                  <li>PD (Placement Driver): Min 3 nodes required for quorum</li>
                  <li>TiKV Storage: Keep below 4TB for PCIe SSDs, 1.5TB for regular SSDs</li>
                  <li>TiDB nodes: Performance scales linearly up to 8 nodes</li>
                  <li>TiKV nodes: Always deploy in multiples of 3 across AZs</li>
                  <li>TiFlash (Analytics): Min 2 nodes for high availability when used</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Recommendations */}
          <div className="bg-indigo-50 p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
            <div className="bg-white p-3 rounded shadow">
              <ul className="list-disc pl-5 space-y-2">
                {tidbCluster.tidbNodes < 3 && (
                  <li className="text-red-600">Increase TiDB nodes to at least 3 for high availability</li>
                )}
                {tidbCluster.tikvNodes < 3 && (
                  <li className="text-red-600">Increase TiKV nodes to at least 3 for data redundancy</li>
                )}
                {tidbCluster.pdNodes < 3 && (
                  <li className="text-red-600">Increase PD nodes to at least 3 for quorum</li>
                )}
                {tidbCluster.tikvNodes % 3 !== 0 && (
                  <li className="text-red-600">TiKV nodes should be in multiples of 3 for proper distribution across AZs</li>
                )}
                {tidbCluster.k8sWorkerNodes < 6 && (
                  <li className="text-red-600">Consider increasing Kubernetes worker nodes to at least 6 for proper distribution</li>
                )}
                {workload.type === 'OLAP' && !tidbCluster.useTiflash && (
                  <li>Consider using TiFlash for analytical workloads</li>
                )}
                {tidbCluster.useTiflash && tidbCluster.tiflashNodes < 2 && (
                  <li className="text-red-600">Increase TiFlash nodes to at least 2 for high availability</li>
                )}
                {storage.tikvUseInstanceStore && tikvInstanceStorageSize === 0 && (
                  <li className="text-red-600">Selected TiKV instance type doesn't have instance store. Choose i3 family or disable 'Use Instance Store'</li>
                )}
                {storage.tikvUseInstanceStore && tikvInstanceStorageSize > 0 && tikvInstanceStorageSize > 4000 && (
                  <li className="text-yellow-600">TiKV storage size exceeds 4TB per node. Consider using more nodes with smaller storage.</li>
                )}
                {!storage.tikvUseInstanceStore && storage.tikvAdditionalEbsSize > 1500 && (
                  <li className="text-yellow-600">TiKV EBS size exceeds 1.5TB. Consider using NVMe instance store for better performance.</li>
                )}
                {!operational.backupToS3 && (
                  <li>Consider enabling backups to S3 for disaster recovery</li>
                )}
                {tidbCluster.availabilityZones < 3 && (
                  <li className="text-red-600">TiDB requires at least 3 availability zones for high availability</li>
                )}
                <li>Use i3 instance family for TiKV nodes to benefit from NVMe storage</li>
                <li>Use gp3 volumes for better price/performance ratio compared to gp2</li>
                <li>Consider reserving at least 8 vCPU per TiDB/TiKV node for production workloads</li>
                <li>Enable EKS managed node groups for easier worker node management</li>
                <li>Use EC2 Auto Scaling groups for worker nodes to handle varying loads</li>
                <li>Consider AWS Load Balancer Controller for TiDB service exposure</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TiDBMigrationCalculator;

// Your existing component code here...

// Add this at the end of the file:
const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(<TiDBMigrationCalculator />);
