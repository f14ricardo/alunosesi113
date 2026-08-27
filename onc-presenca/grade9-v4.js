const __oncOriginalDecrypt = decryptData;
decryptData = async function(password){
  const list = await __oncOriginalDecrypt(password);
  return list.map((student,index)=> index >= 39 ? {...student, series:'9º Ano do Ensino Fundamental', level:'Nível B'} : student);
};
const __oncSeriesFilter = document.querySelector('#seriesFilter');
if (__oncSeriesFilter && ![...__oncSeriesFilter.options].some(o=>o.value==='9º Ano do Ensino Fundamental')) {
  const option = document.createElement('option');
  option.value = '9º Ano do Ensino Fundamental';
  option.textContent = '9º Ano do Ensino Fundamental';
  __oncSeriesFilter.insertBefore(option, __oncSeriesFilter.options[1]);
}
