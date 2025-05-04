import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, Alert } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import { getQuestions } from '../../services/adminApi';

function AdminQuestionListPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [rowCountState, setRowCountState] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getQuestions(paginationModel.page + 1, paginationModel.pageSize);
        if (!active) { return; }
        setRows(result.questions || []);
        setRowCountState(result.pagination?.totalItems || 0);
      } catch (err) {
         if (!active) { return; }
        setError(err.message || 'Sorular yüklenirken bir hata oluştu.');
        setRows([]);
        setRowCountState(0);
      } finally {
         if (!active) { return; }
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [paginationModel]);

  const columns = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'question_text', headerName: 'Soru Metni', flex: 1, minWidth: 250 },
    { field: 'branch', headerName: 'Branş', width: 150 },
    { field: 'grade', headerName: 'Sınıf', width: 100 },
    {
      field: 'options', headerName: 'Seçenekler', flex: 1, minWidth: 200, sortable: false,
      renderCell: (params) => (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: '0.8rem' }}>
          {JSON.stringify(params.value, null, 2)}
        </pre>
      ),
    },
    { field: 'correct_answer', headerName: 'Doğru Cevap', width: 150 },
    {
        field: 'actions', headerName: 'İşlemler', width: 150, sortable: false, filterable: false,
        renderCell: (params) => (
            <Box>
                <Button size="small" onClick={() => console.log("Edit:", params.id)}>Düzenle</Button>
                <Button size="small" color="error" onClick={() => console.log("Delete:", params.id)}>Sil</Button>
            </Box>
        ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1"> Soru Yönetimi </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => console.log("Add new question")}> Yeni Soru Ekle </Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper sx={{ height: 650, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          rowCount={rowCountState}
          pageSizeOptions={[10, 25, 50]}
          paginationModel={paginationModel}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          slots={{ toolbar: GridToolbar }}
          slotProps={{ toolbar: { showQuickFilter: true } }}
          sx={{
             '& .MuiDataGrid-cell': { whiteSpace: 'normal !important', wordWrap: 'break-word !important', lineHeight: '1.4 !important', pt: 1, pb: 1, alignItems: 'flex-start' },
             '& .MuiDataGrid-columnHeader': { fontWeight: 'bold' },
             '& .MuiDataGrid-cell--textLeft': { textAlign: 'left' },
             '& .MuiDataGrid-cell--textRight': { textAlign: 'left' }
          }}
           rowHeight={100}
        />
      </Paper>
    </Box>
  );
}

export default AdminQuestionListPage;