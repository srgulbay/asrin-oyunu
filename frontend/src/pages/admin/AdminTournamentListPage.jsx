import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, Button, CircularProgress, Alert, IconButton, Chip, Tooltip } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'; // Aktif et ikonu
import ArchiveIcon from '@mui/icons-material/Archive'; // Arşivle ikonu
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; // Aktif ikonu
import DraftsIcon from '@mui/icons-material/Drafts'; // Taslak ikonu
import InventoryIcon from '@mui/icons-material/Inventory'; // Arşiv ikonu
import { getTournaments, updateTournament } from '../../services/adminApi'; // API fonksiyonları

function AdminTournamentListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false); // Durum değiştirme işlemi için

  const loadTournaments = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const tournaments = await getTournaments();
        setRows(tournaments || []);
      } catch (err) {
        setError(err.message || 'Turnuvalar yüklenirken bir hata oluştu.');
        setRows([]);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const handleStatusChange = async (id, currentTournament, newStatus) => {
      setActionLoading(true);
      setError(null);
      try {
          // Sadece status ve diğer zorunlu alanları gönder (PUT endpoint'ine göre ayarla)
          const updateData = {
              name: currentTournament.name, // Mevcut adı koru
              description: currentTournament.description,
              allowed_grades: currentTournament.allowed_grades,
              status: newStatus
          };
          await updateTournament(id, updateData);
          // Başarılı olursa listeyi yenile
          loadTournaments();
      } catch (err) {
           setError(`Turnuva durumu güncellenirken hata: ${err.message}`);
      } finally {
          setActionLoading(false);
      }
  };

  const getStatusChip = (status) => {
      switch (status) {
          case 'active': return <Chip label="Aktif" color="success" size="small" icon={<CheckCircleIcon />} />;
          case 'archived': return <Chip label="Arşivlendi" color="default" size="small" icon={<InventoryIcon />} />;
          case 'draft':
          default: return <Chip label="Taslak" color="warning" size="small" icon={<DraftsIcon />} />;
      }
   };


  const columns = [
    { field: 'tournament_id', headerName: 'ID', width: 70 },
    { field: 'name', headerName: 'Turnuva Adı', flex: 1, minWidth: 200 },
    {
        field: 'status', headerName: 'Durum', width: 130,
        renderCell: (params) => getStatusChip(params.value)
    },
    {
        field: 'allowed_grades', headerName: 'İzinli Sınıflar', width: 150,
        valueGetter: (value) => (Array.isArray(value) ? value.join(', ') : 'Tümü') || 'Tümü',
        sortable: false
    },
    {
        field: 'created_at', headerName: 'Oluşturulma', width: 170,
        valueGetter: (value) => value ? new Date(value).toLocaleString() : '',
    },
     {
        field: 'updated_at', headerName: 'Güncellenme', width: 170,
        valueGetter: (value) => value ? new Date(value).toLocaleString() : '',
    },
    {
        field: 'actions', headerName: 'İşlemler', width: 180, sortable: false, filterable: false, align: 'center', headerAlign: 'center',
        renderCell: (params) => (
            <Box>
                <Tooltip title="Düzenle">
                    <IconButton size="small" onClick={() => navigate(`/admin/tournaments/edit/${params.id}`)} disabled={actionLoading}>
                        <EditIcon fontSize="inherit"/>
                    </IconButton>
                 </Tooltip>
                 {params.row.status !== 'active' && (
                     <Tooltip title="Aktif Et">
                         <IconButton size="small" color="success" onClick={() => handleStatusChange(params.id, params.row, 'active')} disabled={actionLoading}>
                             <PlayCircleOutlineIcon fontSize="inherit"/>
                         </IconButton>
                     </Tooltip>
                 )}
                 {params.row.status !== 'archived' && (
                     <Tooltip title="Arşivle">
                         <IconButton size="small" color="warning" onClick={() => handleStatusChange(params.id, params.row, 'archived')} disabled={actionLoading}>
                             <ArchiveIcon fontSize="inherit"/>
                         </IconButton>
                      </Tooltip>
                 )}
                 {/* TODO: Silme butonu eklenebilir */}
            </Box>
        ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1"> Turnuva Yönetimi </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/admin/tournaments/new')}> Yeni Turnuva Ekle </Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {actionLoading && <CircularProgress size={20} sx={{mb:1}} />}
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.tournament_id} // ID alanını belirt
            initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
                sorting: { sortModel: [{ field: 'created_at', sort: 'desc' }] } // Varsayılan sıralama
             }}
             pageSizeOptions={[10, 25, 50]}
             // Server-side pagination için gerekli değil (şimdilik tümünü çekiyoruz)
             // paginationMode="server"
             // rowCount={rowCountState}
             // onPaginationModelChange={setPaginationModel}
             slots={{ toolbar: GridToolbar }}
             slotProps={{ toolbar: { showQuickFilter: true } }}
             sx={{ '& .MuiDataGrid-cell': { whiteSpace: 'normal !important', wordWrap: 'break-word !important', lineHeight: '1.4 !important', pt: 1, pb: 1, alignItems: 'flex-start' }, '& .MuiDataGrid-columnHeader': { fontWeight: 'bold' }, '& .MuiDataGrid-cell--textLeft': { textAlign: 'left' }, '& .MuiDataGrid-cell--textRight': { textAlign: 'left' } }}
        />
      </Paper>
    </Box>
  );
}

export default AdminTournamentListPage;